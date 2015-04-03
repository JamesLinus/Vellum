// Knockout might help make some of the binding here more maintainable.
// Hopefully its not too hard to follow.

// I chose to use regex parsing of nodeset filter conditions because it was fast
// and I knew it would work, but we might want to switch to using the XPath
// JISON parser if it can handle parsing nodesets with filter conditions in a
// way that lets us test equality minus whitespace, quotes, etc.  For instance,
// it currently prevents you from referencing instances with filter conditions
// of their own in a filter condition.

// I chose not to use the property/widget framework for each individual widget
// because it seemed like the interactions between the different properties
// would require a lot of complicated code to make it work with that framework.
// It might be a good idea to flesh out the BoundPropertyMap thing using ES5
// properties and then have some sort of formal system for mapping model objects
// with nested properties to UI objects with nested properties.

// It would be nice to convert the instance definition storage to use
// first-class abstractions rather than simple hashes.
define([
    'underscore',
    'jquery',
    'tpl!vellum/templates/external_data_source', 
    'tpl!vellum/templates/custom_data_source',
    'vellum/widgets',
    'vellum/datasources',
    'vellum/form',
    'vellum/mugs',
    'vellum/parser',
    'vellum/util',
    'vellum/debugutil',
    'vellum/core',
    'jquery.bootstrap-better-typeahead'
], function (
    _,
    $,
    external_data_source,
    custom_data_source,
    widgets,
    datasources,
    form,
    mugs,
    parser,
    util,
    debug
) {
    var mugTypes = mugs.baseMugTypes.normal,
        Itemset,
        END_FILTER = /\[[^\[]*\]$/;

    Itemset = util.extend(mugs.defaultOptions, {
        isControlOnly: true,
        typeName: 'External Data',
        tagName: 'itemset',
        icon: 'icon-circle-blank',
        isTypeChangeable: false,
        // have to delete the parent select
        isRemoveable: false,
        isCopyable: false,
        getIcon: function (mug) {
            if (mug.parentMug.__className === "SelectDynamic") {
                return 'icon-circle-blank';
            } else {
                return 'icon-check-empty';
            }
        },
        init: function (mug, form, baseSpec) {
            mug.p.itemsetData = {};
        },
        writeControlLabel: false,
        writeControlRefAttr: null,
        writeCustomXML: function (xmlWriter, mug) {
            var data = mug.p.itemsetData,
                nodeset = data.nodeset;
            if (data.filterRef) {
                nodeset += data.filterRef;
            }
            xmlWriter.writeAttributeString(
                'nodeset', nodeset || '');
            xmlWriter.writeStartElement('label');
            xmlWriter.writeAttributeString(
                'ref', data.labelRef || '');
            xmlWriter.writeEndElement();
            xmlWriter.writeStartElement('value');
            xmlWriter.writeAttributeString(
                'ref', data.valueRef || '');
            xmlWriter.writeEndElement();
        },
        spec: {
            label: { presence: 'notallowed' },
            labelItext: { presence: 'notallowed' },
            labelItextID: { presence: 'notallowed' },
            hintLabel: { presence: 'notallowed' },
            hintItext: { presence: 'notallowed' },
            hintItextID: { presence: 'notallowed' },
            helpItext: { presence: 'notallowed' },
            helpItextID: { presence: 'notallowed' },
            mediaItext: { presence: 'notallowed' },
            otherItext: { presence: 'notallowed' },
            appearance: { presence: 'notallowed' },
            itemsetData: {
                visibility: 'visible_if_present',
                presence: 'optional',
                widget: itemsetWidget,
                validationFunc: function (mug) {
                    var itemsetData = mug.p.itemsetData;
                    if (!itemsetData.nodeset) {
                        return "A data source must be selected.";
                    }
                    if (!itemsetData.valueRef) {
                        return "Choice Value must be specified.";
                    }
                    if (!itemsetData.labelRef) {
                        return "Choice Label must be specified.";
                    }
                    return 'pass';
                }
            }
        }
    });

    function afterDynamicSelectInsert(form, mug) {
        form.createQuestion(mug, 'into', "Itemset", true);
    }

    $.vellum.plugin("itemset", {}, {
        getSelectQuestions: function () {
            return this.__callOld().concat([
                "SelectDynamic",
                "MSelectDynamic"
            ]);
        },
        getMugTypes: function () {
            var types = this.__callOld();
            types.auxiliary.Itemset = Itemset;
            types.normal = $.extend(types.normal, {
                "MSelectDynamic": util.extend(mugTypes.MSelect, {
                    typeName: 'Multiple Answer - Dynamic List',
                    typeChangeError: function (mug, typeName) {
                        return typeName === "SelectDynamic" ? "" : "Can only change to a dynamic single answer";
                    },
                    validChildTypes: ["Itemset"],
                    maxChildren: 1,
                    afterInsert: afterDynamicSelectInsert,
                }),
                "SelectDynamic": util.extend(mugTypes.Select, {
                    typeName: 'Single Answer - Dynamic List',
                    typeChangeError: function (mug, typeName) {
                        return typeName === "MSelectDynamic" ? "" : "Can only change to a dynamic multiple answer";
                    },
                    validChildTypes: ["Itemset"],
                    maxChildren: 1,
                    afterInsert: afterDynamicSelectInsert
                })
            });
            return types;
        },
        updateControlNodeAdaptorMap: function (map) {
            this.__callOld();
            var adaptItemset = parser.makeControlOnlyMugAdaptor('Itemset');
            map.itemset = function ($element, appearance, form, parentMug) {
                var adapt = function (mug, form) {
                    if (parentMug.__className === 'Select') {
                        form.changeMugType(parentMug, 'SelectDynamic');
                    } else if (parentMug.__className === 'MSelect') {
                        form.changeMugType(parentMug, 'MSelectDynamic');
                    } else {
                        debug.log("Unknown parent type: " + parentMug.__className);
                    }
                    mug = adaptItemset(mug, form);
                    var nodeset = $element.popAttr('nodeset'),
                        s = nodeset.search(END_FILTER),
                        filter = s === -1 ? '' : nodeset.slice(s);
                    mug.p.itemsetData = {
                        instance: form.parseInstance(nodeset, mug, "itemsetData.instance"),
                        nodeset: nodeset.replace(END_FILTER, ''),
                        labelRef: $element.children('label').attr('ref'),
                        valueRef: $element.children('value').attr('ref'),
                        filterRef: filter
                    };
                    return mug;
                };
                adapt.ignoreDataNode = true;
                return adapt;
            };
        },
        loadXML: function () {
            this.__callOld();
            this.data.core.form.on("mug-property-change", function (event) {
                var mug = event.mug;
                if (mug.__className === "Itemset" && event.property === "itemsetData") {
                    updateDataSource(mug, event.val, event.previous);
                }
            });
        }
    });

    function updateDataSource(mug, value, previous) {
        if (previous && previous.instance && previous.instance.src) {
            mug.form.dropInstanceReference(
                        previous.instance.src, mug, "itemsetData.instance");
        }
        if (value && value.instance && value.instance.src) {
            var instanceId = mug.form.addInstanceIfNotExists(
                    value.instance, mug, "itemsetData.instance");
            if (instanceId !== value.instance.id) {
                value.instance.id = instanceId;
                value.nodeset = mug.form.updateInstanceQuery(value.nodeset, instanceId);
            }
        }
    }

    function itemsetWidget(mug, options) {
        var widget = datasources.fixtureWidget(mug, options, "Data Source"),
            super_getUIElement = widget.getUIElement,
            super_getValue = widget.getValue,
            super_setValue = widget.setValue,
            super_handleChange = widget.handleChange.bind(widget),
            labelRef = refSelect("label_ref", "Choice Label", false),
            valueRef = refSelect("value_ref", "Choice Value", false),
            filterRef = refSelect("filter_ref", "Choice Filter", false);

        function updateAutoComplete() {
            if (widget.getValue().instance) {
                var sources = datasources.autocompleteChoices(widget.getValue().instance.src);
                labelRef.addAutoComplete(sources);
                valueRef.addAutoComplete(sources);
            }
        }

        var local_handleChange = function() {
            updateAutoComplete();
            super_handleChange();
        };

        widget.handleChange = local_handleChange;

        labelRef.onChange(super_handleChange);
        valueRef.onChange(super_handleChange);
        filterRef.onChange(super_handleChange);

        widget.getUIElement = function () {
            return super_getUIElement()
                .append(labelRef.element)
                .append(valueRef.element)
                .append(filterRef.element);
        };

        widget.getValue = function () {
            var val = super_getValue(),
                s = val.query.search(END_FILTER),
                filter = s === -1 ? '' : val.query.slice(s);
            return {
                instance: ($.trim(val.src) ? {id: val.id, src: val.src} : null),
                nodeset: val.query ? val.query.replace(END_FILTER, '') : '',
                labelRef: labelRef.val(),
                valueRef: valueRef.val(),
                filterRef: filterRef.val() || filter
            };
        };

        widget.setValue = function (val) {
            val = val || {};
            super_setValue({
                id: (val.instance ? val.instance.id : ""),
                src: (val.instance ? val.instance.src : ""),
                query: val.nodeset ? val.nodeset.replace(END_FILTER, '') : ""
            });
            labelRef.val(val.labelRef);
            valueRef.val(val.valueRef);
            filterRef.val(val.filterRef);
        };

        return widget;
    }

    function refSelect(name, label, isDisabled) {
        var input = $("<input type='text' class='input-block-level'>");
        input.attr("name", name);
        return {
            addAutoComplete: function(sources) {
                input.autocomplete({source: sources, minLength: 0});
            },
            element: widgets.util.getUIElement(input, label, isDisabled),
            val: function (value) {
                if (_.isUndefined(value)) {
                    return input.val();
                } else {
                    input.val(value || "");
                }
            },
            onChange: function (callback) {
                input.bind("change keyup", callback);
            }
        };
    }
});
