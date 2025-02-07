FROM node:10.22.0-alpine

# Add timezone database
RUN apk add --no-cache tzdata

# Set labels
LABEL application="gateway-api"
LABEL branch=${BRANCH}
LABEL commit=${COMMIT}
LABEL date=${BUILD_DATE}

# Set ENV variables
ENV COMMIT_BRANCH=${BRANCH}
ENV COMMIT_SHA=${COMMIT}
ENV BUILD_DATE=${DATE}

# app directory
WORKDIR /usr/src/app

# install dependancies
COPY package*.json ./
COPY yarn.lock ./

RUN yarn install

# copy pwd file to container
COPY . .

# create empty env file
RUN touch .env

EXPOSE 5000

CMD ["yarn", "run", "start"]