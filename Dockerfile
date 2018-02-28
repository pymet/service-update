FROM node:8-alpine

FROM alpine:3.6
COPY --from=0 /usr/local/bin/node /usr/bin/
COPY --from=0 /usr/lib/libgcc* /usr/lib/libstdc* /usr/lib/

RUN apk add --update --no-cache \
    docker
RUN mkdir -p /opt/app

WORKDIR /opt/app
COPY . /opt/app


CMD [ "node", "index.js" ]
