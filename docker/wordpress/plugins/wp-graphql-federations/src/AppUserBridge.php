<?php
/**
 * AppUserBridge
 *
 * Cross-subgraph bridge between WordPress users and Better Auth users.
 *
 * Adds a `User.appUser: AppUser` field to the WPGraphQL schema. The field
 * resolver reads the WP user's `app_user_id` user-meta and returns a federation
 * entity reference of shape `{ __typename: "AppUser", id: <uuid> }`. The
 * Apollo Gateway then routes the entity to the users-subgraph (which owns
 * AppUser) for actual hydration via __resolveReference. No custom GraphQL
 * resolver lives in users-subgraph for this — it's pure federation.
 *
 * Also exposes a service-bearer-protected REST endpoint
 * `POST /wp-json/desafio/v1/link-app-user` that the Better Auth signup hook
 * (and the backfill script) use to write the meta on existing WP users.
 */

namespace Manuelantunes\WpGraphqlFederations;

class AppUserBridge {

	const META_KEY = 'app_user_id';

	public static function init() {
		$instance = new self();
		add_action( 'graphql_register_types', [ $instance, 'register_types' ] );
		add_filter( 'wp_graphql_federation_default_types', [ $instance, 'register_federated_app_user' ] );
		add_action( 'rest_api_init', [ $instance, 'register_rest_routes' ] );
	}

	/**
	 * Register the AppUser type stub (just the federation key field) and
	 * the User.appUser field that returns the entity reference.
	 */
	public function register_types() {
		if ( ! function_exists( 'register_graphql_object_type' ) ) {
			return;
		}

		// Stub AppUser type. The owning subgraph (users) supplies email/name/etc.
		// We only need `id` here so the federation key field is well-typed.
		if ( ! \WPGraphQL::get_type_registry()->get_type( 'AppUser' ) ) {
			register_graphql_object_type( 'AppUser', [
				'description' => 'Reference to a Better Auth user. Resolved by the users subgraph via federation.',
				'fields'      => [
					'id' => [ 'type' => [ 'non_null' => 'ID' ] ],
				],
			] );
		}

		register_graphql_field( 'User', 'appUser', [
			'type'        => 'AppUser',
			'description' => 'The matching Better Auth user, when one is linked via the app_user_id meta.',
			'resolve'     => function ( $user ) {
				$wp_user_id = $user->databaseId ?? null;
				if ( ! $wp_user_id ) {
					return null;
				}
				$app_user_id = get_user_meta( $wp_user_id, self::META_KEY, true );
				if ( empty( $app_user_id ) || ! is_string( $app_user_id ) ) {
					return null;
				}
				return [
					'__typename' => 'AppUser',
					'id'         => $app_user_id,
				];
			},
		] );
	}

	/**
	 * Register AppUser as a federated entity in the federation plugin's
	 * default types map. The plugin's SDL pass adds `@key(fields: "id")`
	 * to it, so the gateway treats AppUser as a cross-subgraph entity.
	 */
	public function register_federated_app_user( $types ) {
		$types['AppUser'] = [
			'enabled' => true,
			'key'     => 'id',
			'kind'    => 'external',
		];
		return $types;
	}

	/**
	 * Register POST /wp-json/desafio/v1/link-app-user.
	 *
	 * Writes the app_user_id user-meta for the WP user matching the given
	 * email. Service-account bearer required (same WP_GRAPHQL_SERVICE_TOKEN
	 * the gateway already uses). Idempotent.
	 */
	public function register_rest_routes() {
		register_rest_route( 'desafio/v1', '/link-app-user', [
			'methods'             => 'POST',
			'permission_callback' => [ $this, 'permission_callback' ],
			'callback'            => [ $this, 'handle_link_app_user' ],
			'args'                => [
				'email'       => [ 'required' => true, 'type' => 'string' ],
				'app_user_id' => [ 'required' => true, 'type' => 'string' ],
			],
		] );
	}

	/**
	 * Bearer auth: the request must carry a Bearer token that the
	 * WPGraphQL JWT Authentication plugin can validate. That plugin
	 * hooks `determine_current_user` (which fires on REST too), so by
	 * the time this callback runs current_user is already set if the
	 * token was valid. We require the resolved user to have admin
	 * capability — matching the existing desafio-svc service-account
	 * contract used by WP_GRAPHQL_SERVICE_TOKEN.
	 */
	public function permission_callback( $request ) {
		$header = $request->get_header( 'authorization' );
		if ( empty( $header ) || stripos( $header, 'Bearer ' ) !== 0 ) {
			return new \WP_Error(
				'rest_forbidden',
				'Missing service-account bearer token.',
				[ 'status' => 401 ]
			);
		}
		if ( ! current_user_can( 'manage_options' ) ) {
			return new \WP_Error(
				'rest_forbidden',
				'Service-account bearer is required.',
				[ 'status' => 401 ]
			);
		}
		return true;
	}

	public function handle_link_app_user( $request ) {
		$email       = trim( (string) $request->get_param( 'email' ) );
		$app_user_id = trim( (string) $request->get_param( 'app_user_id' ) );

		if ( $app_user_id === '' || ! self::is_app_user_id( $app_user_id ) ) {
			return new \WP_REST_Response(
				[ 'error' => 'invalid_app_user_id' ],
				400
			);
		}

		$user = get_user_by( 'email', $email );
		if ( ! $user ) {
			return new \WP_REST_Response(
				[ 'error' => 'user_not_found' ],
				404
			);
		}

		update_user_meta( $user->ID, self::META_KEY, $app_user_id );

		return new \WP_REST_Response(
			[ 'wp_user_id' => (int) $user->ID ],
			200
		);
	}

	/**
	 * Accept Better Auth's nanoid-style IDs (32+ chars alphanumeric) and
	 * UUIDs alike. Defensive — rejects empty strings and obvious garbage
	 * but doesn't pin to a specific generator format since Better Auth
	 * is configurable.
	 */
	private static function is_app_user_id( $value ) {
		if ( ! is_string( $value ) ) return false;
		$len = strlen( $value );
		if ( $len < 16 || $len > 128 ) return false;
		return (bool) preg_match( '/^[A-Za-z0-9_-]+$/', $value );
	}
}
