import { PeerAddress } from 'shared/model/types';
import { MemoryPeer } from 'shared/model/Peer/memoryPeer';
import IPeerRepository from 'core/repository/peer/index';
import { SerializedFullHeaders } from 'shared/model/Peer/fullHeaders';

class PeerMemoryRepository implements IPeerRepository <PeerAddress, MemoryPeer> {
    private peers: Map<string, MemoryPeer>;

    constructor() {
        this.peers = new Map();
    }

    add(peerAddress: PeerAddress, headers: SerializedFullHeaders) {
        this.peers.set(
            `${peerAddress.ip}:${peerAddress.port}`,
            new MemoryPeer(peerAddress, headers)
        );
    }

    remove(peerAddress: PeerAddress): void {
        this.peers.delete(`${peerAddress.ip}:${peerAddress.port}`);
    }

    removeAll() {
        this.peers.clear();
    }

    get(peerAddress: PeerAddress): MemoryPeer {
        return this.peers.get(`${peerAddress.ip}:${peerAddress.port}`);
    }

    getAll(): Array<MemoryPeer> {
        return [...this.peers.values()];
    }

    getPeerAddresses(): Array<PeerAddress & { peerCount: number }> {
        return this.getAll().map((peer: MemoryPeer) => ({
            ...peer.peerAddress,
            peerCount: peer.headers.peerCount,
        }));
    }

    has(peerAddress: PeerAddress): boolean {
        return this.peers.has(`${peerAddress.ip}:${peerAddress.port}`);
    }

    getMemoryPeersByFilter(height, broadhash): Array<MemoryPeer> {

        return [...this.peers.values()].filter((peer: MemoryPeer) => {
            return peer.headers.height >= height
                && peer.headers.broadhash !== broadhash;
        });
    }

    get count(): number {
        return this.peers.size;
    }
}

export default new PeerMemoryRepository();
