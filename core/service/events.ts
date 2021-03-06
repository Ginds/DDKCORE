import SocketMiddleware from 'core/api/middleware/socket';
import { EVENT_TYPES } from 'shared/driver/socket/codes';
import AccountRepository from 'core/repository/account';
import BlockRepository from 'core/repository/block';
import SyncService from 'core/service/sync';
import config from 'shared/config';
import { Address } from 'shared/model/types';
import TransactionPool from 'core/service/transactionPool';
import TransactionQueue from 'core/service/transactionQueue';
import PeerRepository from 'core/repository/peer';
import { logger } from 'shared/util/logger';

export type BlockchainInfo = {
    totalSupply: number;
    circulatingSupply: number;
    tokenHolders: number;
    totalStakeAmount: number;
    totalStakeHolders: number;
};

export type SystemInfo = {
    height: number;
    consensus: number;
    datetime: Date;
    transactionsCount: {
        queue: number,
        conflictedQueue: number,
        pool: number,
    },
    peersCount: number;
    broadhash: string;
    version: string,
};

class EventService {

    updateBlockchainInfo() {
        const preMinedAccounts = config.CONSTANTS.PRE_MINED_ACCOUNTS.map((address: Address) =>
            AccountRepository.getByAddress(address)
        );
        const circulatingSupply = config.CONSTANTS.TOTAL_SUPPLY.AMOUNT -
            preMinedAccounts.reduce((sum, acc) => sum += (acc ? acc.actualBalance : 0), 0);
        const statistics = AccountRepository.getStatistics();

        SocketMiddleware.emitEvent<BlockchainInfo>(EVENT_TYPES.UPDATE_BLOCKCHAIN_INFO, {
            totalSupply: config.CONSTANTS.TOTAL_SUPPLY.AMOUNT,
            circulatingSupply,
            tokenHolders: statistics.tokenHolders,
            totalStakeAmount: statistics.totalStakeAmount,
            totalStakeHolders: statistics.totalStakeHolders,
        });
    }

    updateSystemInfo() {
        const height = BlockRepository.getLastBlock() ? BlockRepository.getLastBlock().height : 0;
        const broadhash = BlockRepository.getLastBlock() ? BlockRepository.getLastBlock().id : '';
        const peersCount = PeerRepository.peerList().length;

        logger.debug(
            `[Server] Queue size: ${TransactionQueue.getSize().queue}, ` +
            `conflicred queue size: ${TransactionQueue.getSize().conflictedQueue}, ` +
            `pool size: ${TransactionPool.getSize()}`
        );

        SocketMiddleware.emitEvent<SystemInfo>(EVENT_TYPES.UPDATE_SYSTEM_INFO, {
            height,
            peersCount,
            broadhash,
            consensus: SyncService.getConsensus(),
            datetime: new Date(),
            version: config.CORE.VERSION,
            transactionsCount: {
                queue: TransactionQueue.getSize().queue,
                conflictedQueue: TransactionQueue.getSize().conflictedQueue,
                pool: TransactionPool.getSize(),
            },
        });
    }
}

export default new EventService();
