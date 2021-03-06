FROM    node:10-alpine
RUN     apk add --no-cache python curl bash automake autoconf libtool git alpine-sdk postgresql-dev netcat-openbsd
RUN     addgroup ddk -g 1100 && \
        adduser -D -u 1100 ddk -G ddk

WORKDIR /home/ddk

USER    ddk
RUN     mkdir -p /home/ddk && \
        mkdir -p /home/ddk/dist && \
        mkdir -p /home/ddk/dist/core && \
        mkdir -p /home/ddk/dist/api && \
        chmod -R 777 /home/ddk && \
        mkdir -p /home/ddk/logs && \
        mkdir -p /home/ddk/public/images/dapps/logs && \
        mkdir -p /home/ddk/public/images/dapps/pids && \
        mkdir -p /home/ddk/public/images/dapps/public && \
        touch /home/ddk/LICENSE

USER    root
RUN     npm install --global npm@latest && \
        npm install --global node-gyp@latest && \
        npm install --global wait-port@latest


# RUN     chmod +x /home/ddk/docker-entrypoint-prod.sh
# CMD     ["/bin/bash", "/home/ddk/docker-entrypoint-prod.sh"]

USER ddk
COPY    ./package*.json /home/ddk/
RUN     npm install

COPY    --chown=ddk . /home/ddk
RUN     npm run build
COPY    --chown=ddk docker-entrypoint-prod.sh /home/ddk/docker-entrypoint-prod.sh

USER    root
RUN     chmod +x /home/ddk/docker-entrypoint-prod.sh

USER    ddk
ENTRYPOINT ["/bin/bash", "/home/ddk/docker-entrypoint-prod.sh"]
