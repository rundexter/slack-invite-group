var _           = require('lodash')
  , agent       = require('superagent')
  , q           = require('q')
  , baseUrl     = 'https://slack.com/api/'
;

module.exports = {
    /**
     * Allows the authenticating users to follow the user specified in the ID parameter.
     *
     * @param {AppStep} step Accessor for the configuration for the step using this module.  Use step.input('{key}') to retrieve input data.
     * @param {AppData} dexter Container for all data used in this workflow.
     */
    run: function(step, dexter) {
        var users  = step.input('user_id')
          , groups = step.input('group_id')
          , token  = dexter.provider('slack').credentials('access_token')
          , self  = this
          , url   = baseUrl + 'groups.invite'
          , promises = []
          , req 
          , group
        ;

        _.each(users, function(user, idx) {
            group = groups[idx] || groups.first();

            promises.push(
                q.all([self.getChannel(token, group), self.getUser(token, user)])
                    .then( function(results) {
                        var group = results[0]
                          , user  = results[1]
                        ;

                        req = agent.post(url)
                                .type('form')
                                .send(_.extend({token: token, user: user, group: group.id }))
                        ;

                        return promisify(req, 'end', 'body.group')
                                .catch(function(err) {
                                    if(err.error === 'cant_invite_self') {
                                        return promisify(
                                            agent.post(baseUrl+'groups.join')
                                                .type('form')
                                                .send({token: token, name: group.name })
                                            , 'end'
                                        );
                                    } else if(err.error == 'already_in_channel') {
                                        return q();
                                    }

                                    throw err;
                                });
                    })
            );
        });

        q.all(promises)
          .then(this.complete.bind(this))
          .catch(this.fail.bind(this))
        ;
    }

    /**
     *  Gets the full group object either by name or id
     *
     *  @param { String } token - access token
     *  @param { String } group - the group id or name
     *
     *  @return { q/Promise} 
     */
    , getChannel: function(token, group) {
        return promisify(
            agent.post(baseUrl+'groups.list')
              .type('form')
              .send({ token: token })
              , 'end', 'body.groups'
        ).then(function(groups) {
            var objGroup;
            if(group[0] === '#') {
                objGroup=_.find(groups, { name: group.substr(1) });
            } else {
                objGroup=_.find(groups, { id: group });
            }

            if(objGroup)
                return objGroup;

            throw new Error("Group not found.");
        });
    }

    /**
     *  Checks the user param, determines if it's an ID
     *  if it's an ID, returns it, else finds the ID
     *
     *  @param { String } token - access token
     *  @param { String } user  - A user ID or username
     *
     *  @returns a promise or user id
     */
    , getUser: function(token, user) {
        if(user[0] === '@') {
           return promisify(
             agent.post(baseUrl+'users.list')
                .type('form')
                .send({ token: token })
             , 'end', 'body.members'
           ).then(function(members) {
              var objUser=_.find(members, { name: user.substr(1) });
              
              if(objUser) {
                return objUser.id;
              }

              throw new Error("User not found.");
           });
        } else {
           return user;
        }
    }
};

function promisify(scope, call, path) {
    var deferred = q.defer(); 

    scope[call](function(err, result) {
        return err || !_.get(result,'body.ok')
          ? deferred.reject(err || result.body)
          : deferred.resolve(_.get(result, path))
        ;
    });

    return deferred.promise;
}
