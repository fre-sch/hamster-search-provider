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
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Search = imports.ui.search;
const Shell = imports.gi.Shell;
const St = imports.gi.St;
const Util = imports.misc.util;
const Gettext = imports.gettext;
const _ = Gettext.domain('hamster-extension').gettext;


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

var panelButton = null;

var hamsterProxy = new HamsterProxy(DBus.session, 'org.gnome.Hamster', '/org/gnome/Hamster');
hamsterProxy.startActivity = function(activity)
{
    let d = new Date();
    let now = parseInt(d.getTime() / 1000);
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

const HamsterActivitiesButton = new Lang.Class({
    Name: 'HamsterActivitiesButton',
    Extends: PanelMenu.Button,

    _createIconLabel: function() {
        let appSys = Shell.AppSystem.get_default();
        let app = appSys.lookup_app('hamster-time-tracker.desktop');
        this._icon = app.create_icon_texture(16);

        let box = new St.BoxLayout({ name: 'hamsterActivitiesButton' });
        this.actor.add_actor(box);

        let iconBox = new St.Bin({name:'hamsterIcon'})
        box.add(iconBox, { y_align: St.Align.MIDDLE, y_fill: false });
        iconBox.child = this._icon;

        this._label = new St.Label({name:'hamsterLabel'});
        box.add(this._label, { y_align: St.Align.MIDDLE, y_fill: false });
    },

    _init: function()
    {
        this.parent(St.Align.START);

        this._createIconLabel();

        hamsterProxy.connect('ActivitiesChanged', Lang.bind(this, function() {
            this._refresh();
        }));

        this._refresh();
    },

    _createSectionActivities: function()
    {
        let section = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(section);
        hamsterProxy.GetActivitiesRemote('', Lang.bind(this, function(activities, err) {
            activities.sort(function(a, b) {
                a = a.map(String.toLowerCase);
                b = b.map(String.toLowerCase);
                if (a[1] == b[1])
                    return a[0] > b[0];
                return a[1] > b[1];
            });
            for (let i=0, n=activities.length; i < n; ++i) {
                let activity = activities[i].join('@');
                let item = new PopupMenu.PopupMenuItem(activity);
                item.connect('activate', Lang.bind(this, function(item) {
                    this.onItemActivate(activity);
                }));
                section.addMenuItem(item);
            }
        }));
    },

    _createSectionNewTask: function()
    {
        let section = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(section);

        let newTaskEntry = new St.Entry({
            name: "newTaskEntry",
            hint_text: _("New task..."),
            track_hover: true,
            can_focus: true
        });
        newTaskEntry.add_style_class_name('popup-menu-item');

        newTaskEntry.clutter_text.connect('key-press-event', Lang.bind(this, function(o, e)
        {
            let symbol = e.get_key_symbol();
            if (symbol == Clutter.Return) {
                this.menu.close();
                hamsterProxy.startActivity(newTaskEntry.get_text());
                this._refresh();
            }
        }));

        section.addActor(newTaskEntry);
    },

    _refresh: function()
    {
        this.menu.removeAll();

        this._createSectionActivities();

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._createSectionNewTask();
    },

    onItemActivate: function(activity)
    {
        hamsterProxy.startActivity(activity);
    },
});

function init(metadata)
{
}

function enable()
{
    if (panelButton == null) {
        panelButton = new HamsterActivitiesButton();
        Main.panel._rightBox.insert_child_at_index(panelButton.actor, 0);
        Main.panel._menus.addMenu(panelButton.menu);

    }
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
    if (panelButton != null) {
        Main.panel._menus.removeMenu(panelButton.menu);
        Main.panel._rightBox.remove_actor(panelButton.actor);
    }
}
