
'use strict';

var watson = require( 'watson-developer-cloud' );  // watson sdk
var localConfig = require('../config');
// var localConfig_workspace_id = localConfig.conversation.workspace_id;
var localConfig_access_key = localConfig.access_key;

var CONVERSATION_SERVICE = 'conversation';
var CONVERSATION_ACCESS_ERROR = 'Sorry, you have no authority to use this conversation.';

function getConversationConfig() {
    if (process.env.VCAP_SERVICES) {
        var services = JSON.parse(process.env.VCAP_SERVICES);
        for (var service_name in services) {
            if (service_name.indexOf(CONVERSATION_SERVICE) === 0) {
                var service = services[service_name][0];
                return {
                    url: service.credentials.url,
                    username: service.credentials.username,
                    password: service.credentials.password
                };
            }
        }
    }else{
        return {
            url: localConfig.conversation.url,
            username: localConfig.conversation.username,
            password: localConfig.conversation.password,
            workspace_id:localConfig.conversation.workspace_id
        };
    }
    return {};
};

// Create the service wrapper
var cs_config = getConversationConfig();

var conversation = watson.conversation( {
    url: cs_config.url,
    username: cs_config.username,
    password: cs_config.password,
    version_date:'2016-07-11',
    version: 'v1'
} );



/**
 * Updates the response text using the intent confidence
 * @param  {Object} payload The request to the Conversation service
 * @param  {Object} response The response from the Conversation service
 * @return {Object}          The response with the updated message
 */
function updateMessage(payload, response) {
    var responseText = null;
    var id = null;

    if ( !response.output ) {
        response.output = {};
    } else {

        if ( response.intents && response.intents[0] ) {
            var intent = response.intents[0];
            if ( intent.confidence >= 0.75 ) {
                responseText = 'I understood your intent was ' + intent.intent;
            } else if ( intent.confidence >= 0.5 ) {
                responseText = 'I think your intent was ' + intent.intent;
            } else {
                responseText = 'I did not understand your intent';
            }

            response.output.text = responseText;

        }
        return response;

    }


}

//
var messageControl = {

    message: function messageControl(req, res) {

        var workspace = process.env.conversation_workspace_id||cs_config.workspace_id;

        if ( !workspace || workspace === '' ) {
            return res.json( {
                'output': {
                    'text': 'The app has not been configured with a <b>WORKSPACE_ID</b> environment variable. Please refer to the ' +
                    '<a href="https://github.com/watson-developer-cloud/conversation-simple">README</a> documentation on how to set this variable. <br>' +
                    'Once a workspace has been defined the intents may be imported from ' +
                    '<a href="https://github.com/watson-developer-cloud/conversation-simple/blob/master/training/car_workspace.json">here</a> in order to get a working application.'
                }
            } );
        }
        var payload = {
            workspace_id: workspace,
            context: {},
            input: {},
        };
        var accessKey = process.env.conversation_access_key||localConfig_access_key;
        if ( req.body ) {
            if ( req.body.accessKey!== accessKey) {
                return res.status( 403 ).json( { error: CONVERSATION_ACCESS_ERROR } );
            }
            if ( req.body.input ) {
                payload.input = req.body.input;
            }
            if ( req.body.context ) {
                // The client must maintain context/state
                payload.context = req.body.context;
            }
        }

        console.log("****** discovery_trained : " + req.body.input.discovery_trained);

        // Send the input to the conversation service
        conversation.message( payload, function(err, data) {
            if ( err ) {
                return res.status( err.code || 500 ).json( err );
            }
            var response = updateMessage( payload, data );


            if ( response.output.discovery_search ) {

                var DiscoveryV1 = require('watson-developer-cloud/discovery/v1');
                var discovery = new DiscoveryV1({
                    username: localConfig.discovery.username,
                    password: localConfig.discovery.password,
                    version_date: '2016-12-01'
                });

                var environment_id = localConfig.discovery_collection_untrained.environment_id;
                var collection_id = localConfig.discovery_collection_untrained.collection_id;
                var query_string = payload.input.text;

                discovery.query({environment_id:environment_id, collection_id:collection_id,query:query_string}, function(error, data) {
                    if (data.results && data.results.length>0) {
                        response.output.text = data.results[0].text;
                    }
                    return res.json(response);

                });

            } else {
                return res.json(response);;
            }


        } );
    }

};

module.exports = messageControl;
