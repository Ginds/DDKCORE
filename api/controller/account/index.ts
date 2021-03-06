import { RPC } from 'api/utils/decorators';
import { Message2 } from 'shared/model/message';
import SocketMiddleware from 'api/middleware/socket';
import { API_ACTION_TYPES } from 'shared/driver/socket/codes';
import { validate } from 'shared/validate';

export class AccountController {

    constructor() {
        this.getAccount = this.getAccount.bind(this);
        this.getAccountBalance = this.getAccountBalance.bind(this);
    }

    @RPC(API_ACTION_TYPES.GET_ACCOUNT)
    @validate()
    getAccount(message: Message2<{ address: string }>, socket: any) {
        SocketMiddleware.emitToCore<{ address: string }>(message, socket);
    }

    @RPC(API_ACTION_TYPES.GET_ACCOUNT_BALANCE)
    @validate()
    getAccountBalance(message: Message2<{ address: string }>, socket: any) {
        SocketMiddleware.emitToCore<{ address: string }>(message, socket);
    }

}

export default new AccountController();
