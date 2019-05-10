import { Block } from 'shared/model/block';
import { Transaction } from 'shared/model/transaction';
import SystemRepository from 'core/repository/system';
import BlockService from 'core/service/block';
import BlockRepository from 'core/repository/block/index';
import { TOTAL_PERCENTAGE } from 'core/util/const';
import config from 'shared/config';
import { logger } from 'shared/util/logger';
import RoundService from 'core/service/round';
import SlotService from 'core/service/slot';
import RoundRepository from 'core/repository/round';
import SharedTransactionRepo from 'shared/repository/transaction';
import BlockController from 'core/controller/block';
import { ResponseEntity } from 'shared/model/response';
import { getLastSlotInRound } from 'core/util/round';
import PeerMemoryRepository from 'core/repository/peer/peerMemory';
import PeerNetworkRepository from 'core/repository/peer/peerNetwork';
import PeerService, { ERROR_NOT_ENOUGH_PEERS } from 'core/service/peer';
import { ActionTypes } from 'core/util/actionTypes';
import { BlockData, BlockLimit, PeerAddress } from 'shared/model/types';
import { getRandom, getRandomElements } from 'core/util/common';
import { NetworkPeer } from 'shared/model/Peer/networkPeer';
import { MemoryPeer } from 'shared/model/Peer/memoryPeer';

const MIN_CONSENSUS = config.CONSTANTS.MIN_CONSENSUS;

export interface ISyncService {

    sendPeers(peerAddress: PeerAddress, requestId): void;

    sendNewBlock(block: Block): void;

    sendUnconfirmedTransaction(trs: Transaction<any>): void;

    checkCommonBlock(lastBlock: BlockData): Promise<ResponseEntity<{ isExist: boolean, peer?: MemoryPeer }>>;

    requestBlocks(lastBlock: Block, peer: PeerAddress): Promise<ResponseEntity<Array<Block>>>;

    sendBlocks(data: { height: number, limit: number }, peer: PeerAddress, requestId: string): void;

}

export class SyncService implements ISyncService {

    consensus: boolean;
    
    async discoverPeers(): Promise<Array<PeerAddress & { peerCount: number }>> {
        const fullNetworkPeerList = PeerNetworkRepository.getAll();
        const randomNetworkPeers = getRandomElements(config.CONSTANTS.PEERS_COUNT_FOR_DISCOVER, fullNetworkPeerList);
        const peersPromises = randomNetworkPeers.map((peer: NetworkPeer) => {
            return peer.requestRPC(ActionTypes.REQUEST_PEERS, {});
        });

        const peersResponses = await Promise.all(peersPromises);
        const result = new Map();
        peersResponses.forEach((response: ResponseEntity<Array<PeerAddress & { peerCount: number }>>) => {
            if (response.success) {
                response.data.forEach(peer => {
                    result.set(`${peer.ip}:${peer.port}`, peer);
                });
            }
        });
        return [...result.values()];
    }

    sendPeers(peerAddress: PeerAddress, requestId): void {
        const peer = PeerNetworkRepository.get(peerAddress);
        const peerAddresses = PeerMemoryRepository.getPeerAddresses();
        peer.responseRPC(ActionTypes.RESPONSE_PEERS, peerAddresses, requestId);
    }

    sendNewBlock(block: Block): void {
        block.relay += 1;
        if (block.relay < config.CONSTANTS.TRANSFER.MAX_RELAY) {
            const serializedBlock: Block & { transactions: any } = block.getCopy();
            serializedBlock.transactions = block.transactions.map(trs => SharedTransactionRepo.serialize(trs));
            PeerService.broadcast(ActionTypes.BLOCK_RECEIVE, { block: serializedBlock });
        }
    }

    sendUnconfirmedTransaction(trs: Transaction<any>): void {
        trs.relay += 1;
        if (trs.relay < config.CONSTANTS.TRANSFER.MAX_RELAY) {
            PeerService.broadcast(
                ActionTypes.TRANSACTION_RECEIVE,
                { trs: SharedTransactionRepo.serialize(trs) }
            );
        }
    }

    async checkCommonBlock(lastBlock: BlockData):
        Promise<ResponseEntity<{ isExist: boolean, peerAddress?: PeerAddress }>> {

        const errors: Array<string> = [];
        const filteredMemoryPeers = PeerMemoryRepository.getMemoryPeersByFilter(
            lastBlock.height,
            SystemRepository.headers.broadhash
        );

        if (!filteredMemoryPeers.length) {
            return new ResponseEntity({ errors: [ERROR_NOT_ENOUGH_PEERS] });
        }
        const randomMemoryPeer = getRandom(filteredMemoryPeers);

        if (this.checkBlockConsensus(lastBlock) || lastBlock.height === 1) {

            return new ResponseEntity({
                data: {
                    isExist: true,
                    peerAddress: randomMemoryPeer.peerAddress
                }
            });

        } else {

            if (randomMemoryPeer.minHeight > lastBlock.height) {
                if (!PeerNetworkRepository.has(randomMemoryPeer.peerAddress)) {
                    errors.push(`Peer ${randomMemoryPeer.peerAddress.ip} is offline`);
                    return new ResponseEntity({ errors });
                }
                const networkPeer = PeerNetworkRepository.get(randomMemoryPeer.peerAddress);
                const response = await networkPeer.requestRPC(
                    ActionTypes.REQUEST_COMMON_BLOCKS,
                    lastBlock
                );

                if (!response.success) {
                    errors.push(`response from peer not success`);
                    errors.push(...response.errors);
                    return new ResponseEntity({ errors });
                }
                const { isExist } = response.data;
                if (isExist) {
                    return new ResponseEntity({ data: { peerAddress: networkPeer.peerAddress, isExist } });
                }
            }
        }
        return new ResponseEntity({ data: { isExist: false } });
    }

    async rollback(): Promise<ResponseEntity<Block>> {

        const blockSlot = SlotService.getSlotNumber(BlockRepository.getLastBlock().createdAt);
        const prevRound = RoundRepository.getPrevRound();
        if (!prevRound) {
            return await BlockService.deleteLastBlock();
        }
        const lastSlotInRound = getLastSlotInRound(prevRound);

        logger.debug(`[Service][Sync][rollback] lastSlotInRound: ${lastSlotInRound}, blockSlot: ${blockSlot}`);

        if (lastSlotInRound >= blockSlot) {
            logger.debug(`[Service][Sync][rollback] round rollback`);
            RoundService.backwardProcess();
        }

        return await BlockService.deleteLastBlock();
    }

    async requestBlocks(lastBlock, peerAddress): Promise<ResponseEntity<Array<Block>>> {
        if (!PeerNetworkRepository.has(peerAddress)) {
            return new ResponseEntity({ errors: [] });
        }
        const networkPeer = PeerNetworkRepository.get(peerAddress);
        return await networkPeer.requestRPC(ActionTypes.REQUEST_BLOCKS, {
            height: lastBlock.height,
            limit: config.CONSTANTS.TRANSFER.REQUEST_BLOCK_LIMIT
        });
    }

    sendBlocks(data: BlockLimit, peerAddress: PeerAddress, requestId): void {
        const blocks = BlockRepository.getMany(data.limit, data.height);
        const serializedBlocks: Array<Block & { transactions?: any }> = blocks.map(block => block.getCopy());
        serializedBlocks.forEach(block => {
            block.transactions = block.transactions.map(trs => SharedTransactionRepo.serialize(trs));
        });
        if (!PeerNetworkRepository.has(peerAddress)) {
            logger.debug(`[Service][Sync][sendBlocks] peer is offline for response ${peerAddress.ip}`);
            return;
        }
        const networkPeer = PeerNetworkRepository.get(peerAddress);
        networkPeer.responseRPC(ActionTypes.RESPONSE_BLOCKS, serializedBlocks, requestId);
    }

    async loadBlocks(blocks: Array<Block>): Promise<ResponseEntity<any>> {
        const errors: Array<string> = [];

        for (let block of blocks) {
            block.transactions.forEach(trs => SharedTransactionRepo.deserialize(trs));
            const receive = await BlockController.onReceiveBlock({ data: { block } });
            if (!receive.success) {
                errors.push(...receive.errors, '[Service][Sync][loadBlocks] error load blocks!');
                return new ResponseEntity({ errors });
            }
        }
        return new ResponseEntity();
    }

    checkCommonBlocks(block: BlockData, peerAddress: PeerAddress, requestId): void {
        const isExist = BlockRepository.isExist(block.id);
        if (!PeerNetworkRepository.has(peerAddress)) {
            logger.debug(`[Service][Sync][checkCommonBlocks] peer is offline for response ${peerAddress.ip}`);
            return;
        }
        const networkPeer = PeerNetworkRepository.get(peerAddress);
        networkPeer.responseRPC(ActionTypes.RESPONSE_COMMON_BLOCKS, { isExist }, requestId);
    }

    updateHeaders(lastBlock: Block) {
        SystemRepository.update({
            broadhash: lastBlock.id,
            height: lastBlock.height,
        });
        SystemRepository.addBlockIdInPool(lastBlock);
        logger.debug(`[Service][Sync][updateHeaders]: height ${lastBlock.height}, broadhash ${lastBlock.id}`);
        PeerService.broadcast(
            ActionTypes.PEER_HEADERS_UPDATE,
            SystemRepository.getHeaders()
        );
    }

    getBlockConsensus(block: BlockData): number {
        const peers = PeerMemoryRepository.getAll();
        const commonPeers = peers.filter(peer => peer.blockExist(block));
        if (!peers.length) {
            return 0;
        }
        return (commonPeers.length + 1) / (peers.length + 1) * TOTAL_PERCENTAGE;
    }

    checkBlockConsensus(blockData: BlockData): boolean {
        return this.getBlockConsensus(blockData) >= MIN_CONSENSUS;
    }

    getConsensus(): number {
        const peers = PeerMemoryRepository.getAll();
        const commonPeers = peers.filter(peer => {
            return peer.headers.broadhash === SystemRepository.headers.broadhash &&
                peer.headers.height === SystemRepository.headers.height;
        });
        if (!peers.length) {
            return 0;
        }
        return (commonPeers.length + 1) / (peers.length + 1) * TOTAL_PERCENTAGE;
    }

    getMyConsensus(): boolean {
        return this.getConsensus() >= MIN_CONSENSUS;
    }

    setConsensus(value: boolean) {
        this.consensus = value;
    }
}

export default new SyncService();
