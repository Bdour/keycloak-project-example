import express from "express";
import session from "express-session";
import passport from "passport";
import {Strategy as SamlStrategy} from "@node-saml/passport-saml";
import {default as bodyParser} from "body-parser";

function createExpressApp(config, LOG) {

    LOG.info("Create express app");

    const app = express();

    app.use(bodyParser.urlencoded({extended: true}));

    configureSession(app, config);
    configureSaml(app, config, LOG);
    configureTemplateEngine(app, config);
    configureRoutes(app, config);

    return app;
}

function configureSession(app, config) {
    app.use(session({
        secret: config.SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
        cookie: {secure: true}
    }));
}

let samlStrategy;

function configureSaml(app, config, LOG) {

    app.use(passport.initialize());
    app.use(passport.session());

    passport.serializeUser(function (user, done) {
        done(null, user);
    });
    passport.deserializeUser(function (user, done) {
        done(null, user);
    });

    let idpSamlMetadataUrl = config.IDP_ISSUER + "/protocol/saml/descriptor";
    LOG.info("Fetching SAML metadata from IdP: " + idpSamlMetadataUrl);
    fetch(idpSamlMetadataUrl).then(response => response.text()).then(samlMetadata => {
        LOG.info("Successfully fetched SAML metadata from IdP");
        // LOG.info("##### SAML Metadata: \n" + samlMetadata)
        // poor man's IdP metadata parsing
        let idpCert = samlMetadata.match(/<ds:X509Certificate>(.*)<\/ds:X509Certificate>/)[1];

        samlStrategy = new SamlStrategy(
            // See Config parameter details: https://www.npmjs.com/package/passport-saml
            // See also https://github.com/node-saml/passport-saml
            {
                entryPoint: config.IDP_ISSUER + "/protocol/saml",
                issuer: config.SP_ISSUER,
                host: config.HOSTNAME,
                protocol: "https://",
                signatureAlgorithm: "sha256",
                privateKey: config.SAML_SP_KEY,
                // cert: config.SAML_IDP_CERT,
                cert: idpCert,
                passReqToCallback: true,
                logoutUrl: config.IDP_ISSUER + "/protocol/saml",
                identifierFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified",
            },
            function (request, profile, done) {
                // profile contains user profile data sent from server
                let user = {
                    username: profile["nameID"],
                    firstname: profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"],
                    lastname: profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"],
                    email: profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"],
                    // e.g. if you added a Group claim
                    group: profile["http://schemas.xmlsoap.org/claims/Group"],
                };
                return done(null, user);
            }
        );
        passport.use(samlStrategy);

    }).catch((error) => {
        console.error('Could not fetch Saml Metadata from IdP', error);
    });
}

function configureTemplateEngine(app, config) {

    // set the view engine to ejs
    app.set('view engine', 'ejs');
}

function configureRoutes(app, config) {

    let ensureAuthenticated = function (req, res, next) {
        if (!req.isAuthenticated()) {
            res.redirect('/login')
            return;
        }
        return next();
    }

    app.get('/login',
        passport.authenticate('saml', {failureRedirect: '/', failureFlash: true}),
        function (req, res) {
            res.redirect('/app');
        }
    );

    app.post('/saml',
        passport.authenticate('saml', {
            failureRedirect: '/error',
            failureFlash: true
        }),
        (req, res) => {

            // success redirection to index
            return res.redirect('/');
        }
    );

    app.post('/saml/consume',
        passport.authenticate('saml', {
            failureRedirect: '/error',
            failureFlash: true
        }),
        (req, res) => {

            // success redirection to /app
            return res.redirect('/app');
        }
    );

    app.get('/logout',
        ensureAuthenticated,
        (req, res, next) => {

            if (req.user != null) {
                return samlStrategy.logout(req, (err, uri) => {
                    return req.logout(err => {
                        if (err) {
                            LOG.warn("Could not logout: " + err);
                            return next(err);
                        }
                        req.session.destroy();
                        res.redirect(uri);
                    });
                });
            }

            return res.redirect('/');
        });

    app.get('/error',
        function (req, res) {
            res.render('pages/error');
        }
    );

    app.get('/',
        function (req, res) {
            res.render('pages/index');
        }
    );

    app.get('/app',
        ensureAuthenticated,
        function (req, res) {
            let user = req.user;
            res.render('pages/app', {
                user
            });
        }
    );
}

export default createExpressApp;
