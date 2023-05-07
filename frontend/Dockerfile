FROM node:18-alpine

WORKDIR /usr/app

COPY package.json .

RUN npm i --quiet

COPY . .

# RUN npm install pm2 -g

CMD ["npm", "start", "src/index.js"]