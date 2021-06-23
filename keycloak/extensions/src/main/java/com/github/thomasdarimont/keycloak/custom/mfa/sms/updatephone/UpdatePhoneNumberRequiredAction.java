package com.github.thomasdarimont.keycloak.custom.mfa.sms.updatephone;

import lombok.extern.jbosslog.JBossLog;
import org.keycloak.authentication.InitiatedActionSupport;
import org.keycloak.authentication.RequiredActionContext;
import org.keycloak.authentication.RequiredActionProvider;
import org.keycloak.events.Errors;
import org.keycloak.events.EventBuilder;
import org.keycloak.events.EventType;
import org.keycloak.forms.login.LoginFormsProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.models.utils.FormMessage;
import org.keycloak.services.validation.Validation;
import org.keycloak.sessions.AuthenticationSessionModel;

import javax.ws.rs.core.MultivaluedMap;
import javax.ws.rs.core.Response;
import java.util.function.Consumer;

@JBossLog
public class UpdatePhoneNumberRequiredAction implements RequiredActionProvider {

    public static final String ID = "acme-update-phonenumber";

    public static final String PHONE_NUMBER_FIELD = "mobile";

    public static final String PHONE_NUMBER_ATTRIBUTE = "phone_number";

    @Override
    public InitiatedActionSupport initiatedActionSupport() {
        // whether we can refer to that action via kc_actions URL parameter
        return InitiatedActionSupport.SUPPORTED;
    }

    @Override
    public void evaluateTriggers(RequiredActionContext context) {

        // check whether we need to show the update custom info form.

        if (!ID.equals(context.getAuthenticationSession().getClientNotes().get("kc_action"))) {
            // only show update form if we explicitly asked for the required action execution
            return;
        }

        if (context.getUser().getFirstAttribute(PHONE_NUMBER_ATTRIBUTE) == null) {
            context.getUser().addRequiredAction(ID);
        }
    }

    @Override
    public void requiredActionChallenge(RequiredActionContext context) {

        // Show form
        context.challenge(createForm(context, null));
    }

    protected Response createForm(RequiredActionContext context, Consumer<LoginFormsProvider> formCustomizer) {

        LoginFormsProvider form = context.form();
        form.setAttribute("username", context.getUser().getUsername());

        String phoneNumber = context.getUser().getFirstAttribute(PHONE_NUMBER_ATTRIBUTE);
        form.setAttribute("currentMobile", phoneNumber == null ? "" : phoneNumber);

        if (formCustomizer != null) {
            formCustomizer.accept(form);
        }

        // use form from src/main/resources/theme-resources/templates/
        return form.createForm("update-phone-number-form.ftl");
    }

    @Override
    public void processAction(RequiredActionContext context) {

        // TODO trigger phone number verification via SMS

        // user submitted the form

        EventBuilder event = context.getEvent();
        AuthenticationSessionModel authSession = context.getAuthenticationSession();
        RealmModel realm = context.getRealm();
        UserModel user = context.getUser();
        KeycloakSession session = context.getSession();

        MultivaluedMap<String, String> formData = context.getHttpRequest().getDecodedFormParameters();
        event.event(EventType.UPDATE_PROFILE);

        String mobile = formData.getFirst(PHONE_NUMBER_FIELD);

        EventBuilder errorEvent = event.clone().event(EventType.UPDATE_PROFILE_ERROR)
                .client(authSession.getClient())
                .user(authSession.getAuthenticatedUser());

        if (Validation.isBlank(mobile) || mobile.length() < 3) {

            Response challenge = createForm(context, form -> {
                form.addError(new FormMessage(PHONE_NUMBER_FIELD, "Invalid Input"));
            });

            context.challenge(challenge);

            errorEvent.error(Errors.INVALID_INPUT);
            return;
        }

        user.setSingleAttribute(PHONE_NUMBER_ATTRIBUTE, mobile);
        user.removeRequiredAction(ID);
        context.success();
    }

    @Override
    public void close() {
        // NOOP
    }
}
