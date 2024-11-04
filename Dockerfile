FROM node
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl --fail http://localhost:3000/ || exit 1

CMD ["node", "app.js"]
