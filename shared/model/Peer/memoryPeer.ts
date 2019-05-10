import { BlockData, PeerAddress } from 'shared/model/types';
import { MAX_PEER_BLOCKS_IDS } from 'core/util/const';
import { FullHeaders, SerializedFullHeaders } from 'shared/model/Peer/fullHeaders';
import { Headers } from 'shared/model/Peer/headers';
import { Peer } from 'shared/model/Peer/index';

export class MemoryPeer extends Peer {
    headers: FullHeaders;

    constructor(peerAddress: PeerAddress, headers: SerializedFullHeaders) {
        super(peerAddress);
        this.headers = new FullHeaders(headers);
        
    }

    private clearBlockIdPoolByHeight(height: number) {
        [...this.headers.blocksIds.keys()]
            .filter(key => key >= height)
            .map(key => this.headers.blocksIds.delete(key));
    }

    update(headers: Headers) {

        this.headers.height = headers.height;
        this.headers.broadhash = headers.broadhash;
        this.headers.peerCount = headers.peerCount;

        if (this.headers.blocksIds.has(headers.height)) {
            this.clearBlockIdPoolByHeight(headers.height);
        }

        this.headers.blocksIds.set(headers.height, headers.broadhash);
        if (this.headers.blocksIds.size > MAX_PEER_BLOCKS_IDS) {
            const min = Math.min(...this.headers.blocksIds.keys());
            this.headers.blocksIds.delete(min);
        }
    }

    get minHeight() {
        return Math.min(...this.headers.blocksIds.keys());
    }

    blockExist(blockData: BlockData): boolean {
        return this.headers.blocksIds.has(blockData.height)
            && this.headers.blocksIds.get(blockData.height) === blockData.id;
    }
}
