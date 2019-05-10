import { PeerAddress } from 'shared/model/types';

export class Peer {
    private _peerAddress: PeerAddress;

    constructor(peerAddress: PeerAddress) {
        this._peerAddress = peerAddress;
    }

    get peerAddress(): PeerAddress {
        return this._peerAddress;
    }
}

