FROM node:22-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy the rest of app's source code respecting .dockerignore
COPY . .

# expose the port the app runs on
EXPOSE 8080

# Define the command to run the app
CMD [ "npm", "start" ]