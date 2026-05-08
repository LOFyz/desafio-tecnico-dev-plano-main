#!/bin/bash
set -e

# Sobe o Apache em background
docker-entrypoint.sh apache2-foreground &

echo "⏳ Aguardando usuário wordpress..."

echo "🔍 Tentando conectar ao MySQL com as credenciais: $WORDPRESS_DB_USER"

until mysql -h db -u"$WORDPRESS_DB_USER" -p"$WORDPRESS_DB_PASSWORD" --skip-ssl -e "SELECT 1" >/dev/null 2>&1; do
  echo "⏳ Usuário wordpress ainda não pronto..."
  sleep 2
done

echo "✅ Usuário pronto!"

# Pequeno delay pra garantir estabilidade
sleep 3

cd /var/www/html

# Aguarda WP carregar (arquivos + config)
until wp core version --allow-root >/dev/null 2>&1; do
  echo "⏳ Aguardando WordPress inicializar..."
  sleep 2
done

echo "✅ WordPress carregado!"

# Instala WP se necessário
if ! wp core is-installed --allow-root; then
  echo "🚀 Instalando WordPress..."

  wp core install \
    --url="http://localhost:8080" \
    --title="Meu WP" \
    --admin_user="admin" \
    --admin_password="admin" \
    --admin_email="admin@email.com" \
    --skip-email \
    --allow-root

  echo "✅ WordPress instalado!"
else
  echo "ℹ️ WordPress já instalado, pulando..."
fi

# Função helper (idempotente)
install_plugin_if_not_exists () {
  if ! wp plugin is-installed "$1" --allow-root; then
    echo "🔌 Instalando plugin: $1"
    wp plugin install "$1" --activate --allow-root
  else
    echo "ℹ️ Plugin já instalado: $1"
  fi
}

install_plugin_from_git () {
  local repo_url="$1"
  local package_id="$2"
  local plugin_path="/var/www/html/wp-content/plugins/$package_id"

  if [ ! -d "$plugin_path" ]; then
    echo "🔌 Instalando $package_id via Git..."
    git clone "$repo_url" "$plugin_path"
  else
    echo "ℹ️ Plugin já instalado: $package_id"
  fi

  wp plugin activate "$package_id" --allow-root || true
}

echo "🔌 Verificando plugins..."

install_plugin_if_not_exists wp-graphql
install_plugin_if_not_exists advanced-custom-fields
install_plugin_if_not_exists wpgraphql-acf
install_plugin_if_not_exists polylang
install_plugin_if_not_exists elementor
install_plugin_if_not_exists reading-time-wp
install_plugin_from_git https://github.com/valu-digital/wp-graphql-polylang.git wp-graphql-polylang
install_plugin_from_git https://github.com/valu-digital/wp-graphql-offset-pagination.git wp-graphql-offset-pagination
install_plugin_from_git https://github.com/m-muhsin/wp-graphql-reading-time wp-graphql-reading-time
install_plugin_from_git https://github.com/wp-graphql/wp-graphql-jwt-authentication wp-graphql-jwt-authentication
install_plugin_from_git https://github.com/Manuel-Antunes/wp-graphql-federations wp-graphql-federations

echo "✅ Plugins prontos!"

# Activate local plugin if present
if [ -d "/var/www/html/wp-content/plugins/wp-graphql-federations" ]; then
  echo "   Activating local plugin: wp-graphql-federations"
  wp plugin activate wp-graphql-federations --allow-root || true
fi

echo "🔗 Garantindo permalink como post name..."
current_permalink="$(wp option get permalink_structure --allow-root 2>/dev/null || true)"

if [ "$current_permalink" != "/%postname%/" ]; then
  wp rewrite structure '/%postname%/' --hard --allow-root
  wp rewrite flush --hard --allow-root
  echo "✅ Permalink atualizado para /%postname%/"
else
  echo "ℹ️ Permalink ja esta em /%postname%/"
fi

# Mantém container vivo
wait
