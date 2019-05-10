export default interface IPeerRepository<PeerAddress, Peer> {

    count: number;

    get(peerAddress: PeerAddress): Peer;

    getAll(): Array<Peer>;

    has(peerAddress: PeerAddress): boolean;

    remove(peerAddress: PeerAddress): void;

    removeAll(): void;
}
