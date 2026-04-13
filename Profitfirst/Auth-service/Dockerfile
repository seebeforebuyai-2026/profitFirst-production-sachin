# 1. Base Image: Hamesha chota aur fast image use karein (Alpine)
FROM node:18-alpine

# 2. Work Directory: Box ke andar ki location
WORKDIR /app

# 3. Dependencies: Pehle package files copy karein
# Isse "Docker Caching" hoti hai, yani npm install baar-baar nahi chalega
COPY package*.json ./

# 4. Install production dependencies only (Fast & Small)
RUN npm install --production

# 5. Copy Source Code: Baaki saara code box mein dalo
COPY . .

# 6. Environment: Production mode set karein
ENV NODE_ENV=production

# 7. Ports: API ke liye 3000 khol dein
EXPOSE 3000

# 8. Command: By default, API server shuru karein
# Note: Hum ise AWS par badal kar 'node workers/shopify-sync.worker.js' bhi kar sakte hain
CMD ["node", "Server.js"]