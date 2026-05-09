FROM wordpress:latest

# Instalar dependências + WP-CLI
RUN apt-get update && apt-get install -y \
    less \
    git \
    mariadb-client \
    curl \
  && rm -rf /var/lib/apt/lists/*

# Necessario para permalinks amigaveis no WordPress
RUN a2enmod rewrite

# Instalar WP-CLI
RUN curl -o /usr/local/bin/wp https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar \
  && chmod +x /usr/local/bin/wp

# Bake the local wp-graphql-federations plugin into the image so deployed
# environments (where docker-compose bind mounts don't apply, e.g. ECS
# Fargate) ship with the AppUserBridge. The entrypoint copies it into
# wp-content/plugins/ on first boot if not already present (the bind-
# mounted local-dev copy shadows it transparently).
COPY plugins/wp-graphql-federations /usr/src/wp-graphql-federations

# Script de inicialização
COPY docker-entrypoint-custom.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint-custom.sh

ENTRYPOINT ["docker-entrypoint-custom.sh"]
CMD ["apache2-foreground"]