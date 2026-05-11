## ADDED Requirements

### Requirement: WP plugin is baked into the WordPress Docker image for deployed environments

The WordPress Dockerfile (`docker/wordpress/Dockerfile`) SHALL bake the local `docker/wordpress/plugins/wp-graphql-federations/` directory into the image at build time. The entrypoint SHALL ensure the baked copy ends up at `/var/www/html/wp-content/plugins/wp-graphql-federations/` on first boot. The local docker-compose bind mount remains in place for the developer dev-loop, but the deployed image MUST NOT depend on a bind mount (Fargate has no equivalent).

#### Scenario: Plugin is present in the deployed image without a bind mount
- **WHEN** SST builds the WordPress image and the resulting Fargate task starts (no docker-compose volume in scope)
- **THEN** the `app_user_id` user-meta REST endpoint, the `User.appUser` field, and the entire AppUserBridge surface work end-to-end against the deployed WP

#### Scenario: Local dev workflow stays unchanged
- **WHEN** a developer runs the local `docker-compose up wordpress`
- **THEN** the docker-compose bind mount at `./docker/wordpress/plugins/wp-graphql-federations:/var/www/html/wp-content/plugins/wp-graphql-federations` shadows the baked-in copy; edits to PHP show up immediately without an image rebuild

#### Scenario: Plugin source is the single source of truth
- **WHEN** the developer edits `docker/wordpress/plugins/wp-graphql-federations/src/AppUserBridge.php` and runs `sst deploy --stage prod`
- **THEN** SST rebuilds the WordPress image with the new PHP, pushes it to ECR, and rolls the Fargate task with no manual `docker push` steps
