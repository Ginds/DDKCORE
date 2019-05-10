import SyncService from 'core/service/sync';
import { ON } from 'core/util/decorator';
import { BaseController } from 'core/controller/baseController';
import PeerService from 'core/service/peer';
import { logger } from 'shared/util/logger';
import { messageON } from 'shared/util/bus';
import System from 'core/repository/system';
import BlockRepository from 'core/repository/block';
import EventQueue from 'core/repository/eventQueue';
import { asyncTimeout } from 'shared/util/timer';
import RoundService from 'core/service/round';
import PeerNetworkRepository from 'core/repository/peer/peerNetwork';
import { BlockData, BlockLimit, PeerAddress, RequestFromPeer } from 'shared/model/types';
import { REQUEST_TIMEOUT } from 'core/driver/socket';
import { ActionTypes } from 'core/util/actionTypes';
import { Headers } from 'shared/model/Peer/headers';

type CheckCommonBlocksRequest = {
    data: BlockData,
    peerAddress: PeerAddress,
    requestId: string,
};

const SYNC_TIMEOUT = 10000;
const LOG_PREFIX = '[Controller][Sync]';
let lastSyncTime: number = 0;

export class SyncController extends BaseController {

    @ON(ActionTypes.REQUEST_COMMON_BLOCKS)
    checkCommonBlocks(action: CheckCommonBlocksRequest): void {
        const { data, peerAddress, requestId } = action;
        logger.debug(`${LOG_PREFIX}[checkCommonBlocks]: ${JSON.stringify(data)}, peer: ${peerAddress.ip}`);
        SyncService.checkCommonBlocks(data, peerAddress, requestId);
    }

    @ON('EMIT_SYNC_BLOCKS')
    async startSyncBlocks(): Promise<void> {
        let lastPeerRequested = null;
        const currentTime = new Date().getTime();
        const syncTimeDiff = currentTime - lastSyncTime;
        if (lastSyncTime && syncTimeDiff < SYNC_TIMEOUT) {
            logger.info(`Wait ${syncTimeDiff} ms for next sync`);
            await asyncTimeout(syncTimeDiff);
        }
        lastSyncTime = currentTime;

        if (SyncService.getMyConsensus() || !PeerNetworkRepository.count) {
            System.synchronization = false;
            messageON('WARM_UP_FINISHED');

            const logMessage = `${LOG_PREFIX}[startSyncBlocks]: Unable to sync`;
            if (SyncService.getMyConsensus()) {
                logger.info(`${logMessage}. Consensus is ${SyncService.getConsensus()}%`);
            } else if (!PeerNetworkRepository.count) {
                logger.info(`${logMessage}. No peers to sync`);
            }
            return;
        }

        System.synchronization = true;
        logger.debug(`${LOG_PREFIX}[startSyncBlocks]: start sync with consensus ${SyncService.getConsensus()}%`);
        RoundService.rollbackToLastBlock();

        // TODO: change sync timeout logic
        let needDelay = false;
        while (!SyncService.getMyConsensus()) {
            if (!needDelay) {
                needDelay = true;
            } else {
                logger.info(`Sync starts after ${SYNC_TIMEOUT} ms`);
                await asyncTimeout(SYNC_TIMEOUT);
            }

            const lastBlock = await BlockRepository.getLastBlock();
            if (!lastBlock) {
                logger.error(`${LOG_PREFIX}[startSyncBlocks] lastBlock is undefined`);
                break;
            }

            const responseCommonBlocks = await SyncService.checkCommonBlock({
                id: lastBlock.id,
                height: lastBlock.height,
            });

            if (!responseCommonBlocks.success) {
                logger.error(
                    `${LOG_PREFIX}[startSyncBlocks][responseCommonBlocks]: ` +
                    responseCommonBlocks.errors.join('. ')
                );
                if (responseCommonBlocks.errors.indexOf(REQUEST_TIMEOUT) !== -1) {
                    continue;
                }
                break;
            }
            const { isExist, peerAddress = null } = responseCommonBlocks.data;
            if (!isExist) {
                if (lastPeerRequested) {
                    PeerService.ban(lastPeerRequested);
                    lastPeerRequested = null;
                }
                await SyncService.rollback();
                needDelay = false;
                continue;
            }
            lastPeerRequested = peerAddress;
            const responseBlocks = await SyncService.requestBlocks(lastBlock, peerAddress);
            if (!responseBlocks.success) {
                logger.error(
                    `${LOG_PREFIX}[startSyncBlocks][responseBlocks]: ${responseBlocks.errors.join('. ')}`
                );
                continue;
            }
            const loadStatus = await SyncService.loadBlocks(responseBlocks.data);
            if (!loadStatus.success) {
                logger.error(`${LOG_PREFIX}[startSyncBlocks][loadStatus]: ${loadStatus.errors.join('. ')}`);
            } else {
                needDelay = false;
            }
        }
        System.synchronization = false;
        messageON('WARM_UP_FINISHED');
        EventQueue.process();
        logger.info(`${LOG_PREFIX}[startSyncBlocks] SYNCHRONIZATION DONE SUCCESS`);
    }

    @ON(ActionTypes.REQUEST_BLOCKS)
    sendBlocks(action: { data: BlockLimit } & RequestFromPeer): void {
        const { data, peerAddress, requestId } = action;
        SyncService.sendBlocks(data, peerAddress, requestId);
    }

    @ON(ActionTypes.PEER_HEADERS_UPDATE)
    updatePeer(action: { data: Headers, peerAddress: PeerAddress }): void {
        const { data, peerAddress } = action;
        logger.debug(`${LOG_PREFIX}[updatePeer][${peerAddress.ip}:${peerAddress.port}] ` +
            `broadhash ${data.broadhash}, height: ${data.height}`);
        PeerService.update(peerAddress, data);
    }

    @ON('LAST_BLOCKS_UPDATE')
    updateHeaders(data: { lastBlock }): void {
        logger.debug(`${LOG_PREFIX}[updateHeaders]: broadhash ${data.lastBlock.id}, height: ${data.lastBlock.height}`);
        SyncService.updateHeaders(data.lastBlock);
    }


}

export default new SyncController();
