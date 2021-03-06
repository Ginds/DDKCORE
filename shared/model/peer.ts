export enum PeerState {
    BANNED = 0,
    DISCONNECTED = 1,
    CONNECTED = 2
}

export class Peer {
    id?: number;
    ip: string;
    port: number;
    peerCount?: number;
    state?: PeerState;
    os?: string;
    version?: string;
    clock?: number;
    broadhash?: string;
    height?: number;
    string?: string;
    socket?: SocketIO.Socket;
    blocksIds?: Map<number, string>;

    constructor() {
    }
}
