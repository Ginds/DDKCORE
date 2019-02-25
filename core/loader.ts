// import db from 'shared/driver/db';
import TransactionDispatcher from 'core/service/transaction';
import { TransactionStatus, TransactionType} from 'shared/model/transaction';
import { Address, PublicKey, Timestamp} from 'shared/model/account';
import { messageON } from 'shared/util/bus';
import {initControllers} from 'core/controller/index';

/**
 * for mock delegates
 */
const crypto = require('crypto');
import { Account } from 'shared/model/account';
import { getAddressByPublicKey } from 'shared/util/account';
import DelegateRepository from 'core/repository/delegate';
import { ed } from 'shared/util/ed';
import AccountRepository from 'core/repository/account';
import RoundService from 'core/service/round';
import BlockService from 'core/service/block';
/**
 * END
 */

import {Delegate} from 'shared/model/delegate';
enum constant  {
    Limit = 1000
}

interface ITransaction <T extends object> {
    id: string;
    blockId: string;
    type: TransactionType;
    senderPublicKey: PublicKey;
    senderAddress: Address;
    recipientAddress: Address;
    signature: string;
    secondSignature: string;
    amount: number;
    createdAt: Timestamp;
    fee: number;
    status?: TransactionStatus;
    asset: T;
}

export class MockDelegates {
    private startData: Array<{name: string, secret: string}> = [
        {
            name: 'DELEGATE_10.6.0.1',
            secret: 'artwork relax sheriff sting fruit return spider reflect cupboard dice goddess slice'
        },
        {
            name: 'DELEGATE_10.5.0.1',
            secret: 'whale slab bridge virus merry ship bright fiber power outdoor main enforce'},
        {
            name: 'DELEGATE_10.7.0.1',
            secret: 'milk exhibit cabbage detail village hero script glory tongue post clinic wish'
        }
    ];

    public init() {
        for (let i = 0; i < this.startData.length; i++) {
            const account = this.createAccount(this.startData[i]);

            AccountRepository.add(account);
            const delegate: Delegate = DelegateRepository.add(account);
            AccountRepository.attachDelegate(account, delegate);
        }

        BlockService.saveGenesisBlock().then(res => {
            RoundService.generateRound();
        });
    }

    private createAccount(data): Account {
        const hash = crypto.createHash('sha256').update(data.secret, 'utf8').digest();
        const publicKey: string = ed.makePublicKeyHex(hash);
        const address: number = Number(getAddressByPublicKey(publicKey).slice(this.startData.length, -1));

        return new Account({
            address: address,
            publicKey: publicKey,
            secondPublicKey: '',
            actualBalance: 1500000000000000,
            votes: [],
            referrals: [],
            stakes: []
        });
    }
}


class Loader {

    constructor() {
        const delegate = new MockDelegates();
        delegate.init();
    }

    public async start() {
        // const totalAmountTrs = await db.one(`
        //     SELECT count(*)::int AS count
        //     FROM trs;
        // `);

        // const countIteration = Math.ceil(totalAmountTrs.count / constant.Limit);

        // for (let i = 0; i < countIteration; i ++ ) {
        //     const transactionBatch = await this.getTransactionBatch(constant.Limit * i);
        //     for (const trs of transactionBatch) {
        //         await TransactionService.applyUnconfirmed(trs);
        //     }
        // }
        initControllers();
        // messageON('WARN_UP_FINISHED');
    }

    private async getTransactionBatch(offset: number): Promise<Array<ITransaction<any>>> {
        // const transactions: Array<ITransaction<any>> = await db.many(`
        //     SELECT *
        //     FROM trs
        //     ORDER BY created_at ASC
        //     LIMIT ${constant.Limit}
        //     OFFSET ${offset}
        // `);
        // return transactions;
        return [];
    }
}

export default new Loader();
