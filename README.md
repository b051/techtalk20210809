### Steps to start server on your local

- we use docker version 19.03
- we use external mysql through 'mysql' network and redis through 'redis' network

#### Setup MySQL and network

- create mysql server (if there isn't one)

```bash
> docker network create mysql
> docker run --name=mysql -d -p 3306:3306 -e MYSQL_ALLOW_EMPTY_PASSWORD=yes --network mysql -v mysql:/var/lib/mysql --restart=always mysql/mysql-server:5.7 mysqld --sql_mode="" --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci --bind-address=0.0.0.0
```

- setup database

```bash
> docker exec -it mysql mysql -uroot
mysql> CREATE DATABASE `wohui-staging`;
mysql> INSERT INTO mysql.user (host, user) VALUES ('%', 'root');
mysql> INSERT INTO mysql.user (host, user) VALUES ('172.18.%', 'root');
mysql> GRANT ALL PRIVILEGES ON *.* TO 'root'@'172.18.%' IDENTIFIED BY '' WITH GRANT OPTION;
mysql> GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' IDENTIFIED BY '' WITH GRANT OPTION;
mysql> FLUSH PRIVILEGES;
```

> notice: it might be differ from '172.18', use docker network to inspect your real docker network IP

#### Setup Redis and network

- create redis server (if there isn't one)

```bash
> docker network create redis
> docker run --name=redis -d -p 6379:6379 --network redis -v redis:/data --restart=always redis:5.0.7-alpine
```

#### Start

- start as a docker service
```bash
> npm start
```

- start individual service

```bash
> TAG=latest docker-compose -f docker/wohui-dev/docker-compose.yml up --build {api|worker|auth0_worker|print|oss_worker}
```

### Start CNL Server

- with env `REGION=cn` and start as normal.