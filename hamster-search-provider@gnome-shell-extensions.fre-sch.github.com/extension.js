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

 // TODO: better use Hamster DBus service
const Main = imports.ui.main;
const Search = imports.ui.search;
const GLib = imports.gi.GLib;
const Shell = imports.gi.Shell;
const Util = imports.misc.util;

var searchProvider = null;

function HamsterSearchProvider() {
    this._init();
}

HamsterSearchProvider.prototype = {
    __proto__: Search.SearchProvider.prototype,

    _init: function(name) {
        Search.SearchProvider.prototype._init.call(this, "Hamster Activities");
        this._activities = this._loadActivities();
    },

    _loadActivities: function() {
        let [res, out, err, status] = GLib.spawn_command_line_sync('hamster-cli list-activities');
        if (res) {
            return out
                .toString()
                .split('\n')
                .map(String.trim)
                .filter(function(item) {return item.length})
                .map(function(item) {
                    return {
                        value: item,
                        chunks: item.toLowerCase().split(/[\s@]+/)
                    };
                });
        }
        else {
            return [];
        }
    },

    _getActivities: function() {
        return this._activities.map(function(item) {
            return {
                __proto__: item,
                score: 0
            };
        });
    },

    getResultMetas: function(resultIds) {
        let metas = [];

        for (let i = 0, n = resultIds.length; i < n; i++) {
            metas.push(this.getResultMeta(resultIds[i]));
        }
        return metas;
    },

    getResultMeta: function(resultId) {
        let appSys = Shell.AppSystem.get_default();
        let app = appSys.lookup_app('hamster-time-tracker.desktop');

        return {
            'id': resultId,
            'name': resultId.value,
            'createIcon': function(size) {
                return app.create_icon_texture(size);
            }
        };
    },

    activateResult: function(id) {
        Util.spawn(['hamster-cli', 'start', id.value]);
        Main.notify('Starting ' + id.value);
    },

    // the more of term matches, the higher the score
    _scoreItem: function(activity, term) {
        for (let i=0, n=activity.chunks.length; i < n; ++i) {
            if (activity.chunks[i].indexOf(term) >= 0)
                activity.score +=  term.length / activity.chunks[i].length;
        }
    },

    getInitialResultSet: function(terms) {
        let terms_lower = terms.map(String.toLowerCase);
        let results = [];
        let activities = this._getActivities();
        for (let i=0, n=activities.length; i < n; ++i) {
            for (let ii=0, nn=terms_lower.length; ii < nn; ++ii) {
                this._scoreItem(activities[i], terms_lower[ii]);
            }
            if (activities[i].score >= 0.2)
                results.push(activities[i]);
        }
        // ordering by score descending, so most matching results are displayed first
        results.sort(function(a, b) {
            return a.score < b.score;
        });
        return results;
    },

    getSubsearchResultSet: function(previousResults, terms) {
        return this.getInitialResultSet(terms);
    },
};

function init(meta) {
}

function enable() {
    if (searchProvider==null) {
        searchProvider = new HamsterSearchProvider();
        Main.overview.addSearchProvider(searchProvider);
    }
}

function disable() {
    if  (searchProvider!=null) {
        Main.overview.removeSearchProvider(searchProvider);
        searchProvider = null;
    }
}
