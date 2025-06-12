FROM node:22-alpine

WORKDIR /usr/src/app

# Copy dependency definitions first for build caching
COPY package*.json ./

# Install all dependencies
RUN npm install

# Copy the rest of the application source code
COPY . .

# Run prisma generate
RUN npx prisma generate

# Expose the port
EXPOSE 8080

# The start command can be
CMD [ "npm", "start" ]