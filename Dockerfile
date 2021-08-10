FROM b051/typescript:12-alpine as builder

WORKDIR /runtime

RUN npm install --production=true

FROM builder
COPY . .
CMD ["npm", "start"]