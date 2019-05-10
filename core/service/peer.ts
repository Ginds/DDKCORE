import PeerMemoryRepository from 'core/repository/peer/peerMemory';
import PeerNetworkRepository from 'core/repository/peer/peerNetwork';
import { NetworkPeer } from 'shared/model/Peer/networkPeer';
import SocketDriver from 'core/driver/socket/index';
import SystemRepository from 'core/repository/system';
import config from 'shared/config';
import { logger } from 'shared/util/logger';
import { SerializedFullHeaders } from 'shared/model/Peer/fullHeaders';
import { PeerAddress } from 'shared/model/types';
import { Headers } from 'shared/model/Peer/headers';
import { sortByKey } from 'shared/util/util';

const LOG_PREFIX = `[Service][Peer]`;
export const ERROR_NOT_ENOUGH_PEERS = 'ERROR_NOT_ENOUGH_PEERS';

export class PeerService {

    add(peerAddress: PeerAddress, headers: SerializedFullHeaders,
        socket: SocketIO.Socket | SocketIOClient.Socket) {
        if (PeerNetworkRepository.isBanned(peerAddress) || config.CORE.PEERS.BLACKLIST.indexOf(peerAddress.ip) !== -1) {
            return false;
        }

        if (PeerMemoryRepository.has(peerAddress)) {
            logger.debug(`${LOG_PREFIX}[add] sockets conflict detected on ${peerAddress.ip}`);
            const networkPeer = PeerNetworkRepository.get(peerAddress);
            const ids = [socket, networkPeer].sort(sortByKey('id'));
            if (ids.indexOf(networkPeer) === 0) {
                logger.debug(`${LOG_PREFIX}[add] destroy new connection on ${peerAddress.ip}, id ${socket.id}`);
                socket.disconnect(true);
                return false;
            } else {
                logger.debug(`${LOG_PREFIX}[add] delete old connection ${networkPeer.id}, create new peer ` +
                    `${peerAddress.ip}`);
                this.remove(peerAddress);
                PeerMemoryRepository.add(peerAddress, headers);
                PeerNetworkRepository.add(peerAddress, socket);
                return true;
            }

        } else {
            PeerMemoryRepository.add(peerAddress, headers);
            PeerNetworkRepository.add(peerAddress, socket);
        }
        return true;

    }

    ban(peerAddress: PeerAddress): void {
        logger.debug(`${LOG_PREFIX}[ban] ${peerAddress.ip}`);
        PeerNetworkRepository.addToBanList(peerAddress);
        this.remove(peerAddress);
    }

    remove(peerAddress: PeerAddress) {
        logger.debug(`${LOG_PREFIX}[remove] ${peerAddress.ip}:${peerAddress.port}`);
        PeerMemoryRepository.remove(peerAddress);
        PeerNetworkRepository.remove(peerAddress);
    }

    removeAll() {
        PeerMemoryRepository.removeAll();
        PeerNetworkRepository.removeAll();
    }

    broadcast(code: string, data: any): void {
        const peers = PeerNetworkRepository.getAll();
        logger.trace(`${LOG_PREFIX}[broadcast]: code ${code} data ${JSON.stringify(data)}`);
        peers.forEach((peer: NetworkPeer) => peer.send(code, data));
    }

    update(peerAddress: PeerAddress, headers: Headers): void {
        if (!PeerMemoryRepository.has(peerAddress)) {
            logger.debug(`[${LOG_PREFIX}][update] peer does not found ${peerAddress.ip}`);
            return;
        }
        const peer = PeerMemoryRepository.get(peerAddress);
        peer.update(headers);
    }

    connectPeers(peerList: Array<PeerAddress>) {

        const headers = SystemRepository.getFullHeaders();
        peerList.forEach((peerAddress: PeerAddress) => {
            if (!PeerMemoryRepository.has(peerAddress)) {
                SocketDriver.connectPeer(peerAddress, headers.serialize());
            }
        });
    }

}

export default new PeerService();
