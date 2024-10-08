# build stage
FROM node:lts-alpine as build-stage
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# production stage
FROM nginx:stable-alpine as production-stage
COPY --from=build-stage app/build /usr/share/nginx/html
COPY nginx/* /etc/nginx/conf.d
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
