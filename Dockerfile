# Use Node 20 base image
FROM node:20-slim

# Install system dependencies AND Chromium
RUN apt-get update && apt-get install -y \
  wget \
  gnupg \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libgdk-pixbuf2.0-0 \
  libnspr4 \
  libnss3 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  xdg-utils \
  libgbm1 \
  chromium \
  chromium-common \
  chromium-driver \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy all source files
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PORT=8080

# Expose port
EXPOSE 8080

# Start your app
CMD ["npm", "run", "test-cron"]