FROM node:20-slim

# Install Playwright system dependencies
RUN apt-get update && apt-get install -y \
    libnss3 libatk-bridge2.0-0 libdrm2 libxcomposite1 libxdamage1 \
    libxrandr2 libgbm1 libasound2 libpangocairo-1.0-0 libgtk-3-0 \
    libxshmfence1 fonts-liberation wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Install Playwright browsers
RUN npx playwright install chromium

# Copy source
COPY . .

# Build Next.js
RUN npm run build

EXPOSE 3005

CMD ["npx", "next", "start", "-p", "3005"]
