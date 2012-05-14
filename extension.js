/* Hamster Activities Search Provider for Gnome Shell
 *
 * Copyright (c) 2011 Frederik Schumacher
 *
 * This programm is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3 of the License, or
 * (at your option) any later version.
 *
 * This programm is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

const Clutter = imports.gi.Clutter;
const DBus = imports.dbus;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Main = imports.ui.main;
const Search = imports.ui.search;
const Shell = imports.gi.Shell;
const St = imports.gi.St;
const Util = imports.misc.util;

const HamsterProxy = DBus.makeProxyClass({
    name: 'org.gnome.Hamster',
    methods: [
        {
            name: 'GetActivities',
            inSignature: 's',
            outSignature: 'a(ss)'
        },
        {
            name: 'AddFact',
            inSignature: 'siib',
            outSignature: 'i'
        },
        {
            name: 'StopTracking',
            inSignature: 'i',
            outSignature: ''
        },
        {
            name: 'Toggle',
            inSignature: '',
            outSignature: ''
        },
        {
            name: 'GetTodaysFacts',
            inSignature: '',
            outSignature: 'a(iiissisasii)',
        }
    ],
    signals: [
        {
            name: 'ActivitiesChanged',
            inSignature: '',
        },
        {
            name: 'FactsChanged',
            inSignature: '',
        }
    ]
});

var searchProvider = null;

var hamsterProxy = new HamsterProxy(DBus.session, 'org.gnome.Hamster', '/org/gnome/Hamster');
hamsterProxy.startActivity = function(activity)
{
    let d = new Date();
    // weird, why is TimezoneOffset negative? should be positive for my zone
    let now = parseInt(Date.now() / 1000) - d.getTimezoneOffset() * 60;
    if (activity == 'stop@current')
    {
        this.StopTrackingRemote(now);
    }
    else {
        this.AddFactRemote(activity, now, 0, false, function(result, err) {
            if (!err) {
                // notify start
                global.log('start:' + activity);
            }
            else {
                // notify err
            }
        });
    }
};

// *sigh* unicode chars are not considered to be in \w or \W
const SplitRegExp = new RegExp('[^a-z0-9äöü]+', 'i');

const HamsterSearchProvider = new Lang.Class({
    Name: 'HamsterSearchProvider',
    Extends: Search.SearchProvider,

    _init: function()
    {
        this.parent('Hamster Activities');
        this.async = true;
        this._appSys = Shell.AppSystem.get_default();
        this._app = this._appSys.lookup_app('hamster-time-tracker.desktop');
    },

    getSubsearchResultSetAsync: function(previousResults, newTerms)
    {
        this.getInitialResultSetAsync(newTerms);
    },

    getInitialResultSetAsync: function(terms)
    {
        hamsterProxy.GetActivitiesRemote('', Lang.bind(this, function(results, err) {
            try {
                results.push(['stop', 'current']);
                let scored_results = results
                    .map(function(result) {
                        let r = {};
                        r.id = result.join('@');
                        let chunks = r.id.split(SplitRegExp).map(String.toLowerCase);
                        r.score = chunks
                            .map(function(ch) {
                                return terms
                                    .map(String.toLowerCase)
                                    .map(function (term) {
                                        return term.length / ch.length * (ch.indexOf(term) + 1);
                                    })
                                    .reduce(function(prev, cur) {
                                        return prev + cur;
                                    })
                                ;
                            })
                            .reduce(function(prev, cur) {
                                return prev + cur;
                            })
                        ;
                        return r;
                    })
                    .filter(function(result) {
                        return result.score >= 0.2;
                    })
                ;
                scored_results.sort(function(a, b) {
                    return a.score < b.score;
                });
                this.searchSystem.pushResults(this, scored_results);
            }
            catch (e) {
                global.log(e.toString());
            }
        }));
    },

    getResultMetasAsync: function(results, callback)
    {
        callback(this.getResultMetas(results));
    },

    getResultMetas: function(results)
    {
        var app = this._app;
        return results.map(function(result) {
            return {
                'id': result.id,
                'name': result.id,
                'createIcon': function(size) {
                    return app.create_icon_texture(size);
                }
            };
        });
    },

    activateResult: function(id)
    {
        let event = Clutter.get_current_event();
        let modifiers = event ? event.get_state() : 0;
        let isCtrlPressed = (modifiers & Clutter.ModifierType.CONTROL_MASK) == Clutter.ModifierType.CONTROL_MASK;
        hamsterProxy.startActivity(id);
    },
});

function init(metadata)
{
}

function enable()
{
    if (searchProvider==null) {
        searchProvider = new HamsterSearchProvider();
        Main.overview.addSearchProvider(searchProvider);
    }
}

function disable()
{
    if  (searchProvider!=null) {
        Main.overview.removeSearchProvider(searchProvider);
        searchProvider = null;
    }
}
