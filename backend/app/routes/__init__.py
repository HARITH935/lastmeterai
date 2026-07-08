def register_blueprints(app):
    from app.routes.auth          import bp as auth_bp
    from app.routes.orders        import bp as orders_bp
    from app.routes.decisions     import bp as decisions_bp
    from app.routes.analytics     import bp as analytics_bp, weather_bp
    from app.routes.notifications import bp as notifications_bp
    from app.routes.chat          import bp as chat_bp
    from app.routes.tracking      import bp as tracking_bp
    from app.routes.models         import bp as models_bp
    app.register_blueprint(auth_bp)
    app.register_blueprint(orders_bp)
    app.register_blueprint(decisions_bp)
    app.register_blueprint(analytics_bp)
    app.register_blueprint(weather_bp)
    app.register_blueprint(notifications_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(tracking_bp)
    app.register_blueprint(models_bp)
