FROM docker.m.daocloud.io/library/nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
RUN cp -R /usr/share/nginx/html/scripts /usr/share/nginx/html/am-scripts \
    && cp -R /usr/share/nginx/html/styles /usr/share/nginx/html/am-styles
