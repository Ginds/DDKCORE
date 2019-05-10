import uuid4 from 'uuid/v4';
import { PEER_SOCKET_CHANNELS, PEER_SOCKET_EVENTS } from 'core/driver/socket/socketsTypes';
import { ResponseEntity } from 'shared/model/response';
import { logger } from 'shared/util/logger';
import { SocketResponse, SocketResponseRPC } from 'shared/model/socket';
import { SOCKET_RPC_REQUEST_TIMEOUT } from 'core/util/const';
import { PeerAddress } from 'shared/model/types';
import { messageON } from 'shared/util/bus';
import { ActionTypes } from 'core/util/actionTypes';
import { Peer } from 'shared/model/Peer/index';
import { REQUEST_TIMEOUT } from 'core/driver/socket';

export class NetworkPeer extends Peer {
    private socket: SocketIO.Socket | SocketIOClient.Socket;

    constructor(peerAddress: PeerAddress, socket: SocketIO.Socket | SocketIOClient.Socket) {
        super(peerAddress);

        logger.debug(`[Peer][new peer] ${peerAddress.ip}:${peerAddress.port}`);
        this.socket = socket;

        socket.on(PEER_SOCKET_CHANNELS.SOCKET_RPC_REQUEST, (response: string) => {
            this.onRPCRequest(response);
        });
        socket.on(PEER_SOCKET_CHANNELS.BROADCAST, (response: string) => {
            this.onBroadcast(response, this.peerAddress);
        });

        socket.on(PEER_SOCKET_EVENTS.DISCONNECT, (reason) => {
            logger.debug(`[NetworkPeer][disconnect]: ${reason}`);
            socket.removeAllListeners();
            if (reason !== 'client namespace disconnect') {
                messageON(ActionTypes.REMOVE_PEER, peerAddress);
            }
        });
    }

    get id(): string {
        return this.socket.id;
    }

    send(code: string, data: any): void {
        this.socket.emit(
            PEER_SOCKET_CHANNELS.BROADCAST,
            JSON.stringify({ code, data })
        );
    }

    sendFullHeaders(fullHeaders): void {
        this.socket.emit(
            PEER_SOCKET_CHANNELS.HEADERS,
            JSON.stringify(fullHeaders)
        );
    }

    async requestRPC(code, data): Promise<ResponseEntity<any>> {
        const requestId = uuid4();
        return new Promise((resolve) => {
            const responseListener = (response) => {
                response = new SocketResponseRPC(response);
                if (response.requestId && response.requestId === requestId) {
                    clearTimeout(timerId);

                    this.socket.removeListener(PEER_SOCKET_CHANNELS.SOCKET_RPC_RESPONSE, responseListener);

                    resolve(new ResponseEntity({ data: response.data }));
                }
            };

            const timerId = setTimeout(
                ((socket, res) => {
                    return () => {
                        socket.removeListener(PEER_SOCKET_CHANNELS.SOCKET_RPC_RESPONSE, responseListener);
                        res(new ResponseEntity({ errors: [REQUEST_TIMEOUT] }));
                    };
                })(this.socket, resolve),
                SOCKET_RPC_REQUEST_TIMEOUT
            );

            this.socket.emit(
                PEER_SOCKET_CHANNELS.SOCKET_RPC_REQUEST,
                JSON.stringify({ code, data, requestId })
            );

            this.socket.on(PEER_SOCKET_CHANNELS.SOCKET_RPC_RESPONSE, responseListener);
        });
    }

    responseRPC(code, data, requestId): void {
        this.socket.emit(
            PEER_SOCKET_CHANNELS.SOCKET_RPC_RESPONSE,
            JSON.stringify({ code, data, requestId })
        );
    }

    disconnect(): void {
        this.socket.removeAllListeners();
        logger.debug(`[NetworkPeer][disconnect] ${this.peerAddress.ip}`);
        if (this.socket.connected) {
            logger.debug(`[NetworkPeer][disconnect] ${this.peerAddress.ip} was connected`);
            this.socket.disconnect(true);
            logger.debug(`[NetworkPeer][disconnect] ${this.peerAddress.ip} has disconnected`);
        }
    }

    private onBroadcast(response: string, peerAddress: PeerAddress): void {
        const { code, data } = new SocketResponse(response);
        messageON(code, { data, peerAddress });
    }

    private onRPCRequest(response: string): void {
        const { code, data, requestId } = new SocketResponseRPC(response);
        logger.debug(
            `[Peer][${this.peerAddress.ip}:${this.peerAddress.port}][onRPCRequest] CODE: ${code}, ` +
            `REQUEST_ID: ${requestId}}`
        );
        messageON(code, { data, peerAddress: this.peerAddress, requestId });
    }
}
