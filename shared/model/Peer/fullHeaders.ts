import { Headers, SerializedHeaders } from 'shared/model/Peer/headers';

export type SerializedFullHeaders = SerializedHeaders & {
  os: string;
  version: string;
  blocksIds: Array<[number, string]>;
};

export class FullHeaders extends Headers {
    private _os: string;
    private _version: string;
    private _blocksIds: Map<number, string>;

    constructor(fullHeaders: SerializedFullHeaders) {
        super(fullHeaders);
        this._os = fullHeaders.os;
        this._version = fullHeaders.version;
        this._blocksIds = new Map(fullHeaders.blocksIds);
    }


    get os(): string {
        return this._os;
    }

    set os(value: string) {
        this._os = value;
    }

    get version(): string {
        return this._version;
    }

    set version(value: string) {
        this._version = value;
    }

    get blocksIds(): Map<number, string> {
        return this._blocksIds;
    }

    set blocksIds(value: Map<number, string>) {
        this._blocksIds = new Map(value);
    }

    serialize(): SerializedFullHeaders {
        return {
            height: this.height,
            broadhash: this.broadhash,
            blocksIds: [...this._blocksIds],
            os: this.os,
            version: this._version,
            peerCount: this.peerCount,
        };
    }

    static deserialize(data: SerializedFullHeaders): FullHeaders {
        return new FullHeaders(data);
    }

}
