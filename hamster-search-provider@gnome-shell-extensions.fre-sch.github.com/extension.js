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

 // TODO: improve activities matching

const Main = imports.ui.main;
const Search = imports.ui.search;
const GLib = imports.gi.GLib;
const Shell = imports.gi.Shell;
const Util = imports.misc.util;
const DBus = imports.dbus;
const Lang = imports.lang;

const HamsterProxy = DBus.makeProxyClass({
    name: 'org.gnome.Hamster',
    methods: [
        {
            name: 'GetActivities',
            inSignature: 's',
            outSignature: 'a(ss)'
        },
    ]
});

var searchProvider = null;

const HamsterSearchProvider = new Lang.Class({
    Name: 'HamsterSearchProvider',
    Extends: Search.SearchProvider,

    _init: function()
    {
        this.parent('Hamster Activities');
        this.async = true;
        this._proxy = new HamsterProxy(DBus.session, 'org.gnome.Hamster', '/org/gnome/Hamster');
        this._appSys = Shell.AppSystem.get_default();
        this._app = this._appSys.lookup_app('hamster-time-tracker.desktop');
    },

    getSubsearchResultSetAsync: function(previousResults, newTerms)
    {
        this.getInitialResultSetAsync(newTerms);
    },

    getInitialResultSetAsync: function(terms)
    {
        for (let i=0, nTerms=terms.length; i < nTerms; ++i) {
            global.log('getInitialResultSetAsync')
            this._proxy.GetActivitiesRemote(terms[i], Lang.bind(this, function(results, err) {
                try {
                    let g = results.length;
                    this.searchSystem.pushResults(this, results);
                }
                catch (e) {
                }
            }));
        }
    },

    getResultMetasAsync: function(results, callback)
    {
        global.log('getResultMetasAsync');
        callback(this.getResultMetas(results));
    },

    getResultMetas: function(ids)
    {
        global.log('getResultMetas: '+ids);
        var app = this._app;
        return ids.map(function(id) {
            return {
                'id': id,
                'name': id.join('@'),
                'createIcon': function(size) {
                    return app.create_icon_texture(size);
                }
            };
        });
    },

    activateResult: function(id) {
        global.log('start activity: ' + id);
    },

});

function init(meta)
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
