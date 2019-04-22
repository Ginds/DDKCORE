import {
    IAsset,
    Transaction,
    TransactionModel,
    TransactionType
} from 'shared/model/transaction';
import { TransactionDTO } from 'migration/utils/TransactionDTO';
import TransactionService from 'core/service/transaction';
import crypto from 'crypto';
import { ed, IKeyPair } from 'shared/util/ed';
import Loader from 'core/loader';
import { getAddressByPublicKey } from 'shared/util/account';
import { Block } from 'shared/model/block';
import BlockRepo from 'core/repository/block';
import RoundService from 'core/service/round';
import { getFirstSlotNumberInRound } from 'core/util/slot';
import DelegateRepository from 'core/repository/delegate';
import RoundRepository from 'core/repository/round';
import { getLastSlotInRound } from 'core/util/round';
import { Round, Slot, Slots } from 'shared/model/round';
import slot from 'core/service/slot';
import BlockService from 'core/service/block';
import { sortRegisterTrs } from 'migration/utils/sorter';
import db from 'shared/driver/db/index';

const csv = require('csv-parser');
const fs = require('fs');

class Basket {
    createdAt: number;
    transactions: Array<TransactionModel<IAsset>>;

    constructor(data: any) {
        this.createdAt = data.createdAt;
        this.transactions = data.transactions;
    }
}

const PREPARE_TRANSACTIONS_AND_WRITE_TO_DB_AS_BASKETS = true;
const START_CREATE_ROUNDS_AND_BLOCKS = true;

// 0 for all transactions
const QUANTITY_PARSE_TRS = 0;
const QUANTITY_TRS_IN_BLOCK = 250;
const COUNT_MIGRATED_REGISTER_TRS = 229594;

const QUERY_SAVE_BASKET_TO_DB = 'INSERT INTO baskets(id, basket) VALUES ($1, $2)';
const QUERY_SELECT_BASKETS = 'SELECT * FROM baskets ORDER BY id LIMIT $1::numeric OFFSET $2::numeric';
const QUERY_SELECT_BASKET_BY_ID = 'SELECT * FROM baskets WHERE id = $1:numeric';

const SENDER_PUBLIC_KEY_FOR_NEGATIVE_BALANCE_ACCOUNTS =
    'b12a7faba4784d79c7298ce49ef5131b291abd70728e6f2bd1bc2207ea4b7947';

const filePathNewTransactions = './transactionsNew_19_04_2019_T13_30.csv';
const filePathAddressesWithNegativeBalance = './addressesWithNegativeBalance.csv';

// TODO need default secret
const DEFAULT_KEY_PAIR: IKeyPair = getKeyPair(
    ''
);

// TODO need secrets all delegates
const delegatesSecrets = [
];

const publicKeyToKeyPairKeyMap: Map<string, IKeyPair> = new Map();

delegatesSecrets.forEach((secret: string) => {
    const keyPair: IKeyPair = getKeyPair(secret);
    publicKeyToKeyPairKeyMap.set(keyPair.publicKey.toString('hex'), keyPair)
});

const correctTransactions: Array<TransactionModel<IAsset>> = [];
const basketsWithTransactionsForBlocks: Array<Basket> = [];

let accounts: Map<number, number> = new Map();
let countForUsedBasket = 0;

(async () => {
    await Loader.start();
    await startMigration();
})().then(_ => console.log('final'));

async function startMigration() {

    console.log('PREPARE_TRANSACTIONS_AND_WRITE_TO_DB_AS_BASKETS: ', PREPARE_TRANSACTIONS_AND_WRITE_TO_DB_AS_BASKETS);
    console.log('START_CREATE_ROUNDS_AND_BLOCKS: ', START_CREATE_ROUNDS_AND_BLOCKS);

    const startTime = new Date();
    console.log('START TIME ', getFormattedDate());

    if (PREPARE_TRANSACTIONS_AND_WRITE_TO_DB_AS_BASKETS) {
        await startPrepareTransactionsForMigration();
    }

    if (START_CREATE_ROUNDS_AND_BLOCKS){
        await startCreateRoundsAndBlocks();
    }

    const endTime = new Date();
    console.log('START TIME ', startTime);
    console.log('END TIME ', endTime);

}

async function startPrepareTransactionsForMigration() {
    console.log('START prepare transaction!!!');

    accounts = await readAccountsToMap(filePathAddressesWithNegativeBalance);


    let [newTrs] = [
        await readTransactionsToArray(filePathNewTransactions),
    ];

    const OLD_TO_NEW_SENDER_PUBLIC_KEY: Map<string, string> = new Map([
        // "amount": 4500000000000000
        ['f4ae589b02f97e9ab5bce61cf187bcc96cfb3fdf9a11333703a682b7d47c8dc2', '86231c9dc4202ba0e27e063f431ef868b4e38669931202a83482c70091714e13'],

        // "amount": 171000000000000
        ['0ffbd8ef561024e20ca356889b5be845759356492ac8237c9bc5159b9d1b0135', 'b12a7faba4784d79c7298ce49ef5131b291abd70728e6f2bd1bc2207ea4b7947'],

        // amount: 9000000000000, new address: 2529254201347404107
        // ['', 'bb49f7f0727847a30f2780b14353d44aec0875e8a4ed77f123fc65f4f66cb3c8'],

        // amount: 2250000000000, newAddress: 13761141028469814636
        ['97c406096a6201a60086e1644cba59af1401b33ba1bbfa1ddccd62fb55374755', '873a809f9b766fc410a6dde5333c73bed36592d7ac5e354eb529591b3ed8dc29'],

        // amount: 11250000000000, newAddress: 3729625658841791180
        // ['', '207deb32d9af211f662d11e20ba88460325fb5e2e18dafc39d054ee1557e5eb0'],

        // amount: 11250000000000, newAddress: 16136522303332999295
        ['14e7911f7fe3c092ce3161a524a6daa2d897e413e684cc934b1ee782122bb934', '0485a185159ae76fbd149e3e6db8ca2ccc01476dce6c7726d7c83e989f456601'],

        // amount: 11250000000000, newAddress: 4694024168786046092
        ['123951bdc3d0608feb8ebd0defd180bfac0dc243e44ac6087749c1f32d3b3ff4', '9807d077e0c0ac95d37819f223506e64e1dbd20c3fbaf003d921c8aed9d426bf'],

        // amount: 45000000000000, newAddress: 7830105952002929850
        ['cb1cb6ee818b958385a50a02cf0fafe9c3b494f524be11894c69df23e7b271fa', 'b9c4743cd3ad541a0334904ebd278a2eaec262f71e5919ebfb8052b720111ff2'],
    ]);
    const OLD_TO_NEW_ADDRESS: Map<string, string> = new Map([
        // "amount": 4500000000000000
        ['DDK4995063339468361088', 'DDK13566253584516829136'],

        // "amount": 171000000000000
        ['DDK8999840344646463126', 'DDK9671894634278263097'],

        // amount: 9000000000000,
        // ['DDK5143663806878841341', 'DDK2529254201347404107'],

        // amount: 2250000000000
        ['DDK7214959811294852078', 'DDK13761141028469814636'],

        // amount: 11250000000000,
        // ['DDK14224602569244644359', 'DDK3729625658841791180'],

        // amount: 11250000000000,
        ['DDK9758601670400927807', 'DDK16136522303332999295'],

        // amount: 11250000000000,
        ['DDK12671171770945235882', 'DDK4694024168786046092'],

        // amount: 45000000000000,
        ['DDK5216737955302030643', 'DDK7830105952002929850'],
    ]);
    newTrs.forEach(((trs: any) => {
        if (OLD_TO_NEW_SENDER_PUBLIC_KEY.has(trs.senderPublicKey)) {
            const tempTrsSenderPublicKey = trs.senderPublicKey;
            trs.senderPublicKey = OLD_TO_NEW_SENDER_PUBLIC_KEY.get(trs.senderPublicKey);
            console.log(`CHANGED trs.senderPublicKey 
            from ${tempTrsSenderPublicKey} to ${trs.senderPublicKey}`)
        }

        if (trs.type === TransactionType.SEND && OLD_TO_NEW_ADDRESS.has(trs.recipientAddress)) {
            const tempTrsRecipientAddress = trs.recipientAddress;
            trs.recipientAddress = OLD_TO_NEW_ADDRESS.get(trs.recipientAddress);
            console.log(`CHANGED trs.recipientAddress
            from ${tempTrsRecipientAddress} to ${trs.recipientAddress}`)
        }

        if (Number(trs.type) === TransactionType.REGISTER) {
            trs.referrals = trs.referrals.substr(1)
            .slice(0, -1)
            .replace(/DDK/ig, '')
            .split(',');
            trs.senderAddress = getAddressByPublicKey(trs.senderPublicKey);
        }
    }));

    const sortedRegisterTrs = sortRegisterTrs(newTrs.slice(0, COUNT_MIGRATED_REGISTER_TRS) as any);
    newTrs = [...sortedRegisterTrs, ...newTrs.slice(COUNT_MIGRATED_REGISTER_TRS)];

    sortedRegisterTrs.length = 0;

    runGarbageCollection();

    let count = 0;
    console.log(newTrs.length);
    newTrs.forEach(
        function <T extends IAsset>(transaction) {
            let correctTransaction: TransactionDTO = null;
            let airdropReward = transaction.airdropReward ? JSON.parse(transaction.airdropReward) : {};
            switch (Number(transaction.type)) {
                case TransactionType.REGISTER:
                    correctTransaction = new TransactionDTO({
                        ...transaction,
                        asset: {
                            referral: transaction.referrals[0]}
                    });
                    break;
                case TransactionType.SEND:
                    correctTransaction = new TransactionDTO({
                        ...transaction,
                        asset: {
                            recipientAddress: transaction.recipientAddress.replace(/DDK/ig, ''),
                            amount: Number(transaction.amount)
                        }
                    });
                    break;
                case TransactionType.SIGNATURE:
                    correctTransaction = new TransactionDTO({
                        ...transaction,
                        asset: {
                            publicKey: transaction.secondPublicKey
                        }
                    });
                    break;
                case TransactionType.DELEGATE:
                    correctTransaction = new TransactionDTO({
                        ...transaction,
                        asset: {
                            username: transaction.username
                        }
                    });
                    break;
                case TransactionType.STAKE:
                    // const oldTransaction: any = oldTrs.get(transaction.id);
                    correctTransaction = new TransactionDTO({
                        ...transaction,
                        asset: {
                            amount: Number(transaction.stakedAmount),
                            startTime: Number(transaction.startTime),
                            startVoteCount: getCorrectStartVoteCount(Number(transaction.voteCount) ),
                        }
                    });
                    if (transaction.airdropReward) {
                        Object.assign(correctTransaction,
                            {
                                airdropReward: {
                                    sponsors: JSON.stringify(transaction.airdropReward.sponsors)
                                    .replace(/DDK/ig, '')
                                }
                            });
                    }
                    break;
                case TransactionType.VOTE:

                    const votes: Array<string> = transaction.votes.split(',') || [];
                    correctTransaction = new TransactionDTO({
                        ...transaction,
                        asset: {
                            votes: votes.map(oldVote => oldVote.slice(1)),
                            type: votes[0][0]
                        },
                    });

                    if (Number(transaction.reward) > 0) {
                        Object.assign(correctTransaction,
                            {
                                reward: Number(transaction.reward),
                                airdropReward: JSON.stringify(airdropReward.sponsors).replace(/DDK/ig, ''),
                            });
                    }
                    break;
                default:

            }

            ++count;
            if (Number.isInteger(count / 1000)) {
                console.log('COUNT: ', count);
            }
            correctTransactions.push(new TransactionModel(correctTransaction));
        });

    console.log('newTrs length: ', newTrs.length);
    newTrs.length = 0;

    runGarbageCollection();
    
    console.log('Cleared newTrs!');
    console.log('newTrs length: ', newTrs.length);

    await changeSendAndStakeTrsOrder();

    await addMoneyForNegativeBalanceAccounts();
    accounts.clear();
    
    runGarbageCollection();

    console.log('Prepared transactions: ', correctTransactions.length);

    await createArrayBasketsTrsForBlocks();
    await basketsWithTransactionsForBlocks.reverse();

    await saveBasketsToDB();
    
    basketsWithTransactionsForBlocks.length = 0;
    
    runGarbageCollection();

    console.log('FINISH prepare transaction!!!');
}

async function startCreateRoundsAndBlocks(){
    await createFirstRoundAndBlocksForThisRound();
    await createNextRoundsAndBlocks();
}

async function saveBasketsToDB() {
    console.log('START SAVE BASKETS TO DB');
    for (let i = 0; i < basketsWithTransactionsForBlocks.length; i++){
        const basket: Basket = basketsWithTransactionsForBlocks[i];
        try {
            console.log('Try to save basket: ', i);
            await db.none(QUERY_SAVE_BASKET_TO_DB, [i, basket]);
        } catch (err) {
            console.log('ERROR: ', err);
            console.log('NOT SAVED BASKET: ', JSON.stringify(basket));
        }
    }
    console.log('FINISH SAVE BASKETS TO DB');
}

let offset = 0;
async function getBatchBasketsFromDbByLimit(limit:number) {
    try {
        const baskets: Array<Basket> = [];
        const rowBaskets:Array<any> = await db.manyOrNone(QUERY_SELECT_BASKETS, [limit, offset]);
        rowBaskets.forEach((dbBasket) => {
           baskets.push(dbBasket.basket)
        });
        offset += baskets.length;
        console.log('OFFSET: ', offset);
        return baskets;
    } catch (err) {
        console.log('Problem with [getBasketsFromDB]');
        console.log('ERROR: ', err)
    }

}

async function getBasketById(id: number){
    try {
        const basket: Basket = await db.oneOrNone(QUERY_SELECT_BASKET_BY_ID, [id]);
        return basket;
    } catch (err) {
        console.log('Problem with [getBasketById]');
        console.log('ERROR: ', err)
    }
}

async function createFirstRoundAndBlocksForThisRound() {
    console.log('START create first round!');
    const limit = DelegateRepository.getActiveDelegates().length;

    const basketsWithTransactionsForBlocks: Array<Basket> = await getBatchBasketsFromDbByLimit(limit);
    const firstRound: Round = RoundService.generate(
        getFirstSlotNumberInRound(
            basketsWithTransactionsForBlocks[0].createdAt,
            DelegateRepository.getActiveDelegates().length
        )
    );

    RoundRepository.add(firstRound);
    let startedCreateFilledBlock = false;

    console.log('FirstRound: ', RoundRepository.getCurrentRound());
    for ( const slot of Object.entries(firstRound.slots)) {
        console.log('slot[1].slot: ', slot[1].slot);
        console.log('basketsWithTransactionsForBlocks[0].createdAt: ',
            Math.floor(basketsWithTransactionsForBlocks[0].createdAt));

        if (slot[1].slot === Math.floor(basketsWithTransactionsForBlocks[0].createdAt) / 10) {
            startedCreateFilledBlock = true;
        }
        console.log('startedCreateFilledBlock: ', startedCreateFilledBlock);
        console.log('slot[0]: ', slot[0]);
        const keyPair: IKeyPair = publicKeyToKeyPairKeyMap.get(slot[0]);
        const timestamp = slot[1].slot * 10;
        const previousBlock = await BlockRepo.getLastBlock();
        let transactions:Array<TransactionModel<IAsset>> = [];
        if (startedCreateFilledBlock) {
            transactions = basketsWithTransactionsForBlocks[countForUsedBasket].transactions.map(
                trs => TransactionService.create(trs, DEFAULT_KEY_PAIR).data
            );
        }

        if (startedCreateFilledBlock && offset === 0){
            offset = DelegateRepository.getActiveDelegates().length - countForUsedBasket;
        }

        console.log('slot ',JSON.stringify(slot));
        console.log('publicKey ',keyPair.publicKey.toString('hex'));
        console.log('privateKey ',keyPair.privateKey.toString('hex'));
        console.log('timestamp ',timestamp);
        console.log('previousBlockId ',previousBlock.id);
        console.log('transactions.length ',transactions.length);

        const block: Block = await BlockService.create({
            keyPair,
            timestamp,
            previousBlock,
            transactions: transactions.map(trs => new Transaction(trs))
        });
        await BlockService.process(block, false, {
            privateKey: keyPair.privateKey,
            publicKey: keyPair.publicKey,
        }, false);

        // if (startedCreateFilledBlock) {
        basketsWithTransactionsForBlocks[countForUsedBasket].transactions.length = 0;
        ++countForUsedBasket;
        // }

    }
    console.log('FINISH create first round!');
}

async function createNextRoundsAndBlocks() {
    console.log('START create next round!');
    let newBlockTimestamp = Math.floor(BlockRepo.getLastBlock().createdAt);
    const activeDelegates = DelegateRepository.getActiveDelegates();
    const limit = activeDelegates.length;
    let basketsWithTransactionsForBlocks: Array<Basket> = await getBatchBasketsFromDbByLimit(limit);
    let countForCreateNewRound = 0;
    while (basketsWithTransactionsForBlocks.length > 0) {
        for (const basket of <Array<Basket>>basketsWithTransactionsForBlocks) {
            if (countForCreateNewRound === 0) {
                forwardProcess();
                countForCreateNewRound = activeDelegates.length;
            }
            const slotsFromCurrentRound: Slots = await RoundRepository.getCurrentRound().slots;
            const previousBlock = await BlockRepo.getLastBlock();
            console.log('previousBlockId: ', previousBlock.id);
            newBlockTimestamp += 10;
            console.log('basket.transactions.length ', basket.transactions.length);
            console.log('slotsFromCurrentRound ', slotsFromCurrentRound);
            // console.log('Object.entries(slotsFromCurrentRound) ', Object.entries(slotsFromCurrentRound));
            console.log('newBlockTimestamp ', newBlockTimestamp);
            const keyPair: IKeyPair = publicKeyToKeyPairKeyMap.get(Object.entries(slotsFromCurrentRound).find(([key, slot]: [string, Slot]) =>
                slot.slot === newBlockTimestamp / 10
            )[0]);

            const transactions = basket.transactions.map(trs => TransactionService.create(trs, DEFAULT_KEY_PAIR).data);
            const block: Block = await BlockService.create({
                keyPair,
                timestamp: newBlockTimestamp,
                previousBlock,
                transactions: transactions.map(trs => new Transaction(trs)),
            });
            await BlockService.process(block, false, {
                privateKey: keyPair.privateKey,
                publicKey: keyPair.publicKey,
            }, false);

            basket.transactions.length = 0;
            --countForCreateNewRound;
        }
        basketsWithTransactionsForBlocks = await getBatchBasketsFromDbByLimit(limit);
    }
    console.log('FINISH create round: ', roundCounter);
}

let roundCounter = 1;
function forwardProcess(): void {
    const currentRound = RoundRepository.getCurrentRound();
    RoundService.processReward(currentRound);

    const newRound = RoundService.generate(getLastSlotInRound(currentRound) + 1);
    RoundRepository.add(newRound);
    console.log(`New round created: ${JSON.stringify(newRound)}, count: ${++roundCounter}`);
}

function createArrayBasketsTrsForBlocks() {
    console.log('START create baskets');
    let transactions: Array<TransactionModel<IAsset>> = [];
    let count = 0;
    let maxTransactionsCreatedAtInBasket = 0;
    do {
        transactions = popTransactionsForMigration(QUANTITY_TRS_IN_BLOCK);
        if (transactions.length) {
            if (maxTransactionsCreatedAtInBasket) {
                maxTransactionsCreatedAtInBasket -= 10;
            } else {
                maxTransactionsCreatedAtInBasket = Math.ceil(Math.max(...transactions.map(trs => trs.createdAt)) / 10) * 10;
            }

            if (maxTransactionsCreatedAtInBasket > 0) {
                basketsWithTransactionsForBlocks.push(
                    new Basket({ createdAt: maxTransactionsCreatedAtInBasket, transactions: transactions })
                );
                ++count;
            }
        }
    } while (transactions.length > 0);

    console.log(`FINISH create basket! Created: ${count} baskets!`);
}

function changeSendAndStakeTrsOrder() {
    console.log('START CHANGE SEND AND STAKE ORDER');
    const setAddress: Set<number> = new Set();
    const mapAddressIndex: Map<number, number> = new Map();

    for (let i = 0; i < correctTransactions.length; i++) {
        const address: number = Number(getAddressByPublicKey(correctTransactions[i].senderPublicKey));
        if (!setAddress.has(address)) {
            setAddress.add(address);
            if (correctTransactions[i].type === TransactionType.STAKE) {
                mapAddressIndex.set(address, i);
            }
        }

        if (correctTransactions[i].type === TransactionType.SEND && mapAddressIndex.has(address)) {
            let index = mapAddressIndex.get(address);
            let intermediateTrs = correctTransactions[index];
            let intermediateCreatedAt = intermediateTrs.createdAt;
            correctTransactions[index] = correctTransactions[i];
            intermediateTrs.createdAt = correctTransactions[index].createdAt;
            correctTransactions[index].createdAt = intermediateCreatedAt;
            correctTransactions[i] = intermediateTrs;

            mapAddressIndex.delete(address);
        }
    }
    setAddress.clear();
    mapAddressIndex.clear();
    console.log('FINISH CHANGE SEND AND STAKE ORDER');
}

async function addMoneyForNegativeBalanceAccounts() {
    console.log('START FIX NEGATIVE BALANCES', accounts.size);
    let lastRegisterIndexCount = 0;
    let createdAtRegisterTrs = 0;
    for (let i = 0; i < correctTransactions.length; i++) {
        const transaction = correctTransactions[i];
        if (transaction.type === TransactionType.REGISTER && createdAtRegisterTrs === 0) {
            lastRegisterIndexCount = i;
            createdAtRegisterTrs = transaction.createdAt;
        } else if (transaction.type === TransactionType.REGISTER && transaction.createdAt === createdAtRegisterTrs) {
            ++lastRegisterIndexCount;
        } else if (i - lastRegisterIndexCount > 1000) {
            break;
        }
    }

    const additionalSendTransactions: Array<Transaction<IAsset>> = [];
    const keyPair: IKeyPair = DEFAULT_KEY_PAIR;
    accounts.forEach(((value, key) => {
        const additionalSendTransaction = new TransactionDTO({
            type: TransactionType.SEND,
            senderPublicKey: SENDER_PUBLIC_KEY_FOR_NEGATIVE_BALANCE_ACCOUNTS,
            createdAt: createdAtRegisterTrs + 1,
            asset: {
                recipientAddress: key,
                amount: Math.abs(value)
            }
        });
        additionalSendTransactions.push(TransactionService.create(new TransactionModel(additionalSendTransaction),
            keyPair).data);
    }));
    await correctTransactions.splice(lastRegisterIndexCount, 0, ...additionalSendTransactions);
    console.log('FINISH FIX NEGATIVE BALANCES');
}

function popTransactionsForMigration(quantity: number) {
    if (correctTransactions.length > quantity) {
        return correctTransactions.splice(correctTransactions.length - quantity, quantity);
    }
    return correctTransactions.splice(0, correctTransactions.length);
}

function readTransactionsToArray(filePath): Promise<Array<Object>> {
    console.log('START parse csv with new transactions!');
    let count = 0;
    return new Promise((resolve, reject) => {

        const transactions: Array<Object> = [];

        fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => {
            if (QUANTITY_PARSE_TRS > 0 && count >= QUANTITY_PARSE_TRS) {
                return;
            }
            transactions.push(data);
            ++count;
        })
        .on('end', () => {
            console.log('Parsed transactions new: ', count);
            console.log('FINISH parse csv with new transactions!');
            resolve(transactions);
        });
    });

}

function readTransactionsToMap(filePath): Promise<Map<string, object>> {

    console.log('START parse csv with old transactions!');
    let count = 0;

    return new Promise((resolve, reject) => {
        const transactions = new Map();

        fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => {
            if (QUANTITY_PARSE_TRS > 0 && count >= QUANTITY_PARSE_TRS) {
                return;
            }
            transactions.set(data.id, data);
            ++count;
        })
        .on('end', () => {
            console.log('Parsed transactions old: ', count);
            console.log('FINISH parse csv with old transactions!');
            resolve(transactions);
        });
    });
}

function readAccountsToMap(filePath): Promise<Map<number, number>> {
    console.log('START parse csv with negative balances accounts!');
    return new Promise((resolve, reject) => {
        const accounts: Map<number, number> = new Map();

        fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => {
            accounts.set(Number(data.address.replace(/DDK/ig, '')), Number(data.amount));
        })
        .on('end', () => {
            console.log('Parsed accounts with negative balance: ', accounts.size);
            resolve(accounts);
        });
    });
}

function getKeyPair(secret: string): IKeyPair {
    const hash = crypto.createHash('sha256').update(secret, 'utf8').digest();
    return ed.makeKeyPair(hash);
}

function getFormattedDate() {
    let date = new Date();
    return date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate() + " " +
        date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds();

}

function getCorrectStartVoteCount(voteCount: number): number {
    if (voteCount === 24) {
        return 20;
    } else if (voteCount < 24) {
        return Math.floor(voteCount / 4);
    } else {
        return 0;
    }
}

export function runGarbageCollection() {
    console.log('global.gc working....');
    try {
        if (global.gc) {global.gc();}
    } catch (e) {
        console.log("`node --expose-gc index.js`");
        // process.exit();
    }
    console.log('global.gc finish');
}

