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

# Script de inicialização
COPY docker-entrypoint-custom.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint-custom.sh

ENTRYPOINT ["docker-entrypoint-custom.sh"]
CMD ["apache2-foreground"]