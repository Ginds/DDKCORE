import SyncService from 'core/service/sync';
import { ON } from 'core/util/decorator';
import { Peer } from 'shared/model/peer';
import { BaseController } from 'core/controller/baseController';
import PeerService from 'core/service/peer';
import { logger } from 'shared/util/logger';
import PeerRepository from 'core/repository/peer';
import { messageON } from 'shared/util/bus';
import System from 'core/repository/system';
import BlockRepository from 'core/repository/block';
import EventQueue from 'core/repository/eventQueue';
import { REQUEST_TIMEOUT } from 'core/repository/socket';
import { asyncTimeout } from 'shared/util/timer';
import RoundService from 'core/service/round';

type checkCommonBlocksRequest = {
    data: {
        block: {
            id: string, height: number
        }
    },
    peer: Peer,
    requestId: string,
};

const SYNC_TIMEOUT = 10000;
const LOG_PREFIX = '[Controller][Sync]';
let lastSyncTime: number = 0;

export class SyncController extends BaseController {
    @ON('REQUEST_COMMON_BLOCKS')
    checkCommonBlocks(action: checkCommonBlocksRequest): void {
        const { data, peer, requestId } = action;
        logger.debug(`${LOG_PREFIX}[checkCommonBlocks]: ${JSON.stringify(data.block)}, peer: ${peer.ip}`);
        SyncService.checkCommonBlocks(data.block, peer, requestId);
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
        if (SyncService.getMyConsensus() || PeerRepository.peerList().length === 0) {
            System.synchronization = false;
            messageON('WARM_UP_FINISHED');

            const logMessage = `${LOG_PREFIX}[startSyncBlocks]: Unable to sync`;
            if (SyncService.getMyConsensus()) {
                logger.info(`${logMessage}. Consensus is ${SyncService.getConsensus()}%`);
            } else if (PeerRepository.peerList().length === 0) {
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
            const responseCommonBlocks = await SyncService.checkCommonBlock(lastBlock);
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
            const { isExist, peer = null } = responseCommonBlocks.data;
            if (!isExist) {
                if (lastPeerRequested) {
                    PeerRepository.ban(lastPeerRequested);
                    lastPeerRequested = null;
                }
                await SyncService.rollback();
                needDelay = false;
                continue;
            }
            lastPeerRequested = peer;
            const responseBlocks = await SyncService.requestBlocks(lastBlock, peer);
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

    @ON('REQUEST_BLOCKS')
    sendBlocks(action: { data: { height: number, limit: number }, peer: Peer, requestId: string }): void {
        const { data, peer, requestId } = action;
        SyncService.sendBlocks(data, peer, requestId);
    }

    @ON('PEER_HEADERS_UPDATE')
    updatePeer(action: { data, peer }): void {
        const { data, peer } = action;
        PeerService.update(data, peer);
    }

    @ON('LAST_BLOCKS_UPDATE')
    updateHeaders(data: { lastBlock }): void {
        logger.debug(`${LOG_PREFIX}[updateHeaders]: id ${data.lastBlock.id}, height: ${data.lastBlock.height}`);
        SyncService.updateHeaders(data.lastBlock);
    }


}

export default new SyncController();
