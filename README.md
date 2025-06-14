# NodeChess - Backend Server

This repository contains the backend server for **NodeChess**, a real-time multiplayer chess application. The server is built with Node.js and designed with a modern, scalable architecture to handle live gameplay, user authentication, and matchmaking.

The corresponding frontend for this project can be found [here](https://github.com/IsbatBInHossain/nodechess).

## Features

- **Real-time Gameplay:** Manages game state and moves via a WebSocket API.
- **User Authentication:** Secure user registration and login using JWTs.
- **Anonymous Guest Play:** Allows users to play instantly without an account.
- **Matchmaking:** Separate matchmaking queues for registered and guest users.
- **Persistent Game Storage:** Saves completed games for registered users to a PostgreSQL database.
- **Scalable by Design:** Uses Redis for managing "hot" data like live game state and a stateless API architecture that is ready to be scaled horizontally.

## Technology Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Real-time Communication:** WebSockets (`ws` library)
- **Database:**
  - **PostgreSQL:** For "cold" data (user accounts, game history).
  - **Redis:** For "hot" data (live game state, matchmaking queues, locks).
- **ORM:** Prisma
- **Containerization:** Docker & Docker Compose
- **Authentication:** JSON Web Tokens (JWT)

## Architecture

The backend consists of three main services orchestrated by Docker Compose:

1.  **API / Game Server:** A Node.js container that handles all REST API endpoints and manages all WebSocket connections and game logic.
2.  **PostgreSQL Database:** A dedicated container for permanent data storage.
3.  **Redis Cache:** A dedicated container for ephemeral, high-speed data access.

This multi-container setup mimics a production environment and ensures a clean separation of concerns.

## Getting Started

### Prerequisites

- [Docker](https://www.docker.com/get-started) and Docker Compose must be installed on your machine.

### Running the Application

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/IsbatBInHossain/chess-game-server.git
    cd chess-game-server
    ```

2.  **Create the environment file:**
    Create a `.env` file in the root of the project by copying the example file:

    ```bash
    cp .env.example .env
    ```

3.  **Build and run the containers:**
    ```bash
    docker-compose up --build
    ```
    This command will build the Node.js image, pull the official Postgres and Redis images, and start all three services.

The API server will be running and accessible at `http://localhost:8080`.

## API Endpoints

A brief overview of the primary endpoints. For the full specification, please refer to the [frontend repository's](https://github.com/IsbatBInHossain/nodechess) README.

- `POST /api/auth/register`: Create a new user account.
- `POST /api/auth/login`: Log in a registered user and receive a JWT.
- `POST /api/auth/guest`: Get a temporary guest JWT for anonymous play.

The WebSocket server is accessible at `ws://localhost:8080`.
