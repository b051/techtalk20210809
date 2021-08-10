FROM node:12-alpine

RUN apk add zsh git
RUN apk add --no-cache --virtual .build-deps \
    curl \
    && sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" \
    && apk del .build-deps

COPY .zshrc /root/

WORKDIR /runtime
RUN npm install -g typescript@4.3.5
RUN npm install -g @types/node
RUN npm install -g source-map-support
RUN npm install -g nodemon
RUN npm install -g copyfiles