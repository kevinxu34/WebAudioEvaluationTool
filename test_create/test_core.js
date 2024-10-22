/* globals document, angular, window, Promise, XMLHttpRequest, Specification, XMLSerializer, Blob, DOMParser, FileReader, $*/
function get(url) {
    // Return a new promise.
    return new Promise(function (resolve, reject) {
        // Do the usual XHR stuff
        var req = new XMLHttpRequest();
        req.open('GET', url);

        req.onload = function () {
            // This is called even on 404 etc
            // so check the status
            if (req.status == 200) {
                // Resolve the promise with the response text
                resolve(req.response);
            } else {
                // Otherwise reject with the status text
                // which will hopefully be a meaningful error
                reject(Error(req.statusText));
            }
        };

        // Handle network errors
        req.onerror = function () {
            reject(Error("Network Error"));
        };

        // Make the request
        req.send();
    });
}

var AngularInterface = angular.module("creator", []);

AngularInterface.directive("dropzone", function () {
    return {
        restrict: "A",
        link: function (scope, elem) {
            elem.bind('dragover', function (evt) {
                evt.stopPropagation();
                evt.preventDefault();
            });
            elem.bind('dragend', function (evt) {
                console.log(evt);
                evt.stopPropagation();
                evt.preventDefault();
            });
            elem.bind('drop', function (event) {
                var evt = event.originalEvent;
                console.log(evt);
                evt.stopPropagation();
                evt.preventDefault();

                var files = evt.dataTransfer.files;
                for (var i = 0, f; f = files[i]; i++) {
                    var reader = new FileReader();
                    reader.readAsArrayBuffer(f);

                    reader.onload = (function (theFile) {
                        return function (e) {
                            scope.ondrop(theFile.name);
                            scope.$apply();
                        };
                    })(f);
                }
            });
        }
    }
});

var specification = new Specification();

window.onload = function () {
    // Get the test interface specifications
    toggleDropdowns();
    $("#popupHolder").modal("show");
};

function toggleDropdowns() {
    $(function () {
        $('[data-toggle="popover"]').popover();
    });
}

function handleFiles(event) {
    var s = angular.element(event.currentTarget).scope();
    s.handleFiles(event);
    s.$apply();
}

AngularInterface.controller("view", ['$scope', '$element', '$window', function ($s, $e, $w) {
    $s.testSpecifications = {};

    (function () {
        new Promise(function (resolve, reject) {
            var xml = new XMLHttpRequest();
            xml.open("GET", "test_create/interfaces/specifications.json");
            xml.onload = function () {
                if (xml.status === 200) {
                    resolve(xml.responseText);
                    return;
                }
                reject(xml.status);
            };
            xml.onerror = function () {
                reject(new Error("Network Error"));
            };
            xml.send();
        }).then(JSON.parse).then(function (data) {
            $s.testSpecifications = data;
            $s.$apply();
        });
    })();

    $s.globalSchema = undefined;
    get("xml/test-schema.xsd").then(function (text) {
        specification.processSchema(text);
        $s.globalSchema = specification.getSchema();
        $s.$apply();
    });
    $s.availableInterfaceModules = [];
    get("interfaces/interfaces.json").then(JSON.parse).then(function (d) {
        $s.availableInterfaceModules = d.interfaces;
        $s.$apply();
    });
    $s.specification = specification;
    $s.selectedTestPrototype = undefined;
    $s.setTestPrototype = function (obj) {
        $s.selectedTestPrototype = obj;
        $w.specification.interface = obj.interface;
    }

    $s.addPage = function () {
        $s.specification.createNewPage();
    };

    $s.removePage = function (page) {
        var index = $s.specification.pages.findIndex(function (a) {
            return a == page;
        });
        if (index === -1) {
            throw ("Invalid Page");
        }
        $s.specification.pages.splice(index, 1);
    };

    $s.exportXML = function () {
        var s = new XMLSerializer();
        var doc = specification.encode();
        
        // Add XML declaration with UTF-8 encoding
        var xmlDeclaration = '<?xml version="1.0" encoding="UTF-8"?>\n';
        
        var xmlstr = xmlDeclaration + s.serializeToString(doc);
        
        // Encode the XML string to UTF-8
        var encoder = new TextEncoder();
        var xmlUint8Array = encoder.encode(xmlstr);
        
        // Add UTF-8 BOM
        var utf8Bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        
        // Combine BOM and XML data
        var combinedArray = new Uint8Array(utf8Bom.length + xmlUint8Array.length);
        combinedArray.set(utf8Bom, 0);
        combinedArray.set(xmlUint8Array, utf8Bom.length);
        
        var bb = new Blob([combinedArray], {
            type: 'application/xml;charset=utf-8'
        });
        
        var dnlk = window.URL.createObjectURL(bb);
        var a = document.createElement("a");
        document.body.appendChild(a);
        a.href = dnlk;
        a.download = "test.xml";
        a.click();
        window.URL.revokeObjectURL(dnlk);
        document.body.removeChild(a);
    };
    $s.validated = false;
    $s.showValidationMessages = false;
    $s.validate = function () {
        var s = new XMLSerializer();
        var xmlDoc = specification.encode();
        
        // Add XML declaration with UTF-8 encoding
        var xmlDeclaration = '<?xml version="1.0" encoding="UTF-8"?>\n';
        
        // Serialize the XML document to a string
        var xmlString = xmlDeclaration + s.serializeToString(xmlDoc);
        
        // Ensure proper UTF-8 encoding
        var encoder = new TextEncoder();
        var xmlUint8Array = encoder.encode(xmlString);
        
        // Convert back to a UTF-8 string for xmllint
        var decoder = new TextDecoder('utf-8');
        var utf8String = decoder.decode(xmlUint8Array);

        console.log("XML being validated:", utf8String);
        
        var options = {
            xml: utf8String,
            schema: specification.getSchemaString(),
            format: 'xsd',  // Assuming you're using XSD schema
            TOTAL_MEMORY: 10 * 1024 * 1024  // Adjust as needed
        };
        
        var result = xmllint.validateXML(options);
        console.log("Validation result:", result);
        
        $s.showValidationMessages = true;

        if (result.errors) {
            $s.validated = false;
            
            // Remove success message if it exists
            var successAlert = document.querySelector(".alert-success");
            if (successAlert) {
                successAlert.parentNode.removeChild(successAlert);
            }

            // Create or update the error panel
            var validationContainer = document.querySelector("[ng-switch]");
            if (!validationContainer) {
                validationContainer = document.createElement("div");
                validationContainer.setAttribute("ng-switch", "on=\"validated\"");
                validationContainer.setAttribute("ng-show", "showValidationMessages");
                document.body.appendChild(validationContainer);
            }

            validationContainer.innerHTML = `
                <div class="panel panel-danger" ng-switch-when="false">
                    <div class="panel-heading">
                        <button type="button" class="close" data-dismiss="alert" aria-label="Close" ng-click="hideValidationMessages"><span aria-hidden="true">&times;</span></button>
                        <h3 class="panel-title">Invalid Specification!</h3>
                    </div>
                    <div class="panel-body">
                        <p>Your specification is invalid. Please fix the following issues!</p>
                        <ul id="validation-error-list"></ul>
                    </div>
                </div>
            `;

            // Now we're sure the list exists, so we can safely manipulate it
            var list = document.getElementById("validation-error-list");
            
            // Add new error messages
            result.errors.forEach(function (str) {
                var li = document.createElement("li");
                li.textContent = str;
                list.appendChild(li);
            });
        } else {
            $s.validated = true;
            
            // Remove error panel if it exists
            var errorPanel = document.querySelector(".panel-danger");
            if (errorPanel) {
                errorPanel.parentNode.removeChild(errorPanel);
            }

            // Show success message
            var validationContainer = document.querySelector("[ng-switch]");
            if (!validationContainer) {
                validationContainer = document.createElement("div");
                validationContainer.setAttribute("ng-switch", "on=\"validated\"");
                validationContainer.setAttribute("ng-show", "showValidationMessages");
                document.body.appendChild(validationContainer);
            }

            validationContainer.innerHTML = `
                <div class="alert alert-success" role="alert" ng-switch-when="true">
                    <button type="button" class="close" data-dismiss="alert" aria-label="Close" ng-click="hideValidationMessages"><span aria-hidden="true">×</span></button>
                    <strong>Validates! </strong><span>Well done, you can export this specification!</span>
                </div>
            `;
        }

        // Ensure Angular updates the view
        $s.$apply();
    }
    $s.hideValidationMessages = function () {
        $s.showValidationMessages = false;
    }
    $s.$watch(function () {
        return document.querySelectorAll("div.pageNode").length;
    }, $w.toggleDropdowns);
    $s.$watch(function () {
        return document.querySelectorAll("div.surveyentry").length;
    }, $w.toggleDropdowns);
    $s.$watch(function () {
        return document.querySelectorAll("div.interface").length;
    }, $w.toggleDropdowns);
    $s.$watch(function () {
        return document.querySelectorAll("div.audioelement").length;
    }, $w.toggleDropdowns);
}]);

AngularInterface.controller("introduction", ['$scope', '$element', '$window', function ($s, $e, $w) {
    $s.state = 0;
    $s.selected = undefined;
    $s.close = function () {
        $($e[0]).modal('hide');
    }
    $s.next = function () {
        if (($s.state === 1 && $s.file) || $s.state === 2) {
            $s.initialise($s.selected);
            if ($s.selected != "AB" && $s.selected != "ABX") {
                $s.close();
            }
        } else if ($s.state === 3 && $s.audioFragments.length > 0) {
            // Populate the audio pages by creating a pairwise set of pairs
            $s.populatePages((function (a) {
                var b = [];
                a.forEach(function (e1, i1, a) {
                    a.forEach(function (e2, i2) {
                        var entry = [e1, e2];
                        if (i1 > i2) {
                            b.push(entry);
                        }
                    });
                });
                return b;
            })($s.audioFragments));
            $s.close();
        } else if ($s.state > 3) {
            $s.close();
        }
        $s.state++;
        console.log("Modal state " + $s.state);
    };
    $s.skip = function () {
        $s.close();
    }
    $s.back = function () {
        $s.state--;
    };

    $s.$watch(function () {
        return ($s.globalSchema !== undefined)
    }, function () {
        if ($s.globalSchema !== undefined && $s.state === 0) {
            $s.state = 1;
        }
    })

    $s.mouseover = function (name) {
        var obj = $s.testSpecifications.interfaces.find(function (i) {
            return i.name == name;
        });
        if (obj) {
            $s.description = obj.description.en;
        }
    };
    $s.initialise = function (name) {
        var obj = $s.testSpecifications.interfaces.find(function (i) {
            return i.name == name;
        });
        if (obj === undefined) {
            throw ("Cannot find specification");
        }
        if (typeof obj.template === "string") {
            get(obj.template).then(function (data) {
                $s.parseFile(data);
            }, function (err) {})
        } else {
            $s.setTestPrototype(obj);
        }
    };
    $s.select = function (name) {
        $s.selected = name;
    };
    // Get the test interface specifications
    $s.file = undefined;
    $s.description = "";

    $s.parseFile = function (f) {
        var p = new DOMParser();
        specification.decode(p.parseFromString(f, "text/xml"));
        $s.$apply();
    }

    $s.handleFiles = function ($event) {
        $s.file = $event.currentTarget.files[0];
        var r = new FileReader();
        r.onload = function () {
            $s.parseFile(r.result);
        };
        r.readAsText($s.file);
    };

    $s.audioFragments = [];
    $s.ondrop = function (filename) {
        $s.audioFragments.push({
            fname: filename,
            name: "fragment-" + String($s.audioFragments.length)
        });
    };

    $s.populatePages = function (structures) {
        structures.forEach(function (p, i) {
            var page = $w.specification.createNewPage();
            page.id = "page-" + String(i);
            p.forEach(function (a) {
                var fragment = page.addAudioElement();
                fragment.name = a.name;
                fragment.id = a.name + "-p" + String(i);
                fragment.url = a.fname;
            });
            page.addInterface();
        });
    }
}]);

AngularInterface.controller("setup", ['$scope', '$element', '$window', function ($s, $e, $w) {
    function initialise() {
        if ($s.globalSchema) {
            $s.schema = $s.globalSchema.querySelector("[name=setup]");
        }
    }
    $s.schema = undefined;
    $s.attributes = [];

    $s.$watch("globalSchema", initialise);
    $s.$watch("specification.metrics.enabled.length", function () {
        var metricsNode = document.getElementById("metricsNode");
        if (!$s.specification.metrics) {
            return;
        }
        metricsNode.querySelectorAll("input").forEach(function (DOM) {
            DOM.checked = false;
        });
        $s.specification.metrics.enabled.forEach(function (metric) {
            var DOM = metricsNode.querySelector("[value=" + metric + "]");
            if (DOM) {
                DOM.checked = true;
            }
        });
    });

    $s.enableMetric = function ($event) {
        var metric = $event.currentTarget.value;
        var index = specification.metrics.enabled.findIndex(function (a) {
            return a == metric;
        });
        if ($event.currentTarget.checked) {
            if (index == -1) {
                specification.metrics.enabled.push(metric);
            }
        } else {
            if (index >= 0) {
                specification.metrics.enabled.splice(index, 1);
            }
        }
    };

    $s.configure = function () {}

    $s.$watch("selectedTestPrototype", $s.configure);

    $s.placeholder = function (name) {
        if ($s.schema) {
            var spec = $s.schema.querySelector("attribute[name=\"" + name + "\"]") || $w.specification.schema.querySelector("attribute[name=\"" + name + "\"]");
            var attr = spec.getAttribute("default");
            if (attr === null) {
                return "Not set";
            }
            return attr;
        }
    }
}]);

AngularInterface.controller("survey", ['$scope', '$element', '$window', function ($s, $e, $w) {
    $s.addSurveyEntry = function () {
        $s.survey.addOption();
    };
    $s.removeSurveyEntry = function (entry) {
        var index = $s.survey.options.findIndex(function (a) {
            return a == entry;
        });
        if (index === -1) {
            throw ("Invalid Entry");
        }
        $s.survey.options.splice(index, 1);
    };
}]);

AngularInterface.controller("surveyOption", ['$scope', '$element', '$window', function ($s, $e, $w) {

    $s.removeOption = function (option) {
        var index = $s.opt.options.findIndex(function (a) {
            return a == option;
        });
        if (index === -1) {
            throw ("Invalid option");
        }
        $s.opt.options.splice(index, 1);
    };
    $s.addOption = function () {
        $s.opt.options.push({
            name: "",
            text: ""
        });
    };

    $s.addCondition = function () {
        $s.opt.conditions.push({
            check: "equals",
            value: "",
            jumpToOnPass: undefined,
            jumpToOnFail: undefined
        });
    };

    $s.removeCondition = function (condition) {
        var index = $s.opt.conditions.findIndex(function (c) {
            return c == condition;
        });
        if (index === -1) {
            throw ("Invalid Condition");
        }
        $s.opt.conditions.splice(index, 1);
    };
}]);

AngularInterface.controller("interfaceNode", ['$scope', '$element', '$window', function ($s, $e, $w) {
    $s.$watch("interface.options.length", function () {
        if (!$s.interface || !$s.interface.options) {
            return;
        }
        var options = $e[0].querySelector(".interfaceOptions").querySelectorAll(".attribute");
        options.forEach(function (option) {
            var name = option.getAttribute("name");
            var index = $s.interface.options.findIndex(function (io) {
                return io.name == name;
            });
            if (name == "scalerange") {
                $e[0].querySelector("[name=min]").value = option.getAttribute("min");
                $e[0].querySelector("[name=max]").value = option.getAttribute("max");
            }
            option.querySelector("input").checked = (index >= 0);
        });
    });
    $s.updateScaleRange = function() {
        var obj = $s.interface.options.find(function(i) {
            return i.name == "scalerange";
        });
        if (obj === undefined) {
            return;
        }
        var min = $e[0].querySelector("[name=min]").value;
        var max = $e[0].querySelector("[name=max]").value;
        obj.min = min;
        obj.max = max;
    };
    $s.enableInterfaceOption = function ($event) {
        var name = $event.currentTarget.parentElement.getAttribute("name");
        var type = $event.currentTarget.parentElement.getAttribute("type");
        var index = $s.interface.options.findIndex(function (io) {
            return io.name == name;
        });
        if (index == -1 && $event.currentTarget.checked) {
            var obj = {
                name: name,
                type: type
            };
            if (name == "scalerange") {
                $s.updateScaleRange();
            }
            $s.interface.options.push(obj);
        } else if (index >= 0 && !$event.currentTarget.checked) {
            $s.interface.options.splice(index, 1);
        }
    };
    $s.scales = [];
    $s.removeScale = function (scale) {
        var index = $s.interface.scales.findIndex(function (s) {
            return s == scale;
        });
        if (index >= 0) {
            $s.interface.scales.splice(index, 1);
        }
    };
    $s.addScale = function () {
        $s.interface.scales.push({
            position: undefined,
            text: undefined
        });
    };
    $s.clearScales = function () {
        $s.interface.scales = [];
    };
    $s.useScales = function (scale) {
        $s.clearScales();
        scale.scales.forEach(function (s) {
            $s.interface.scales.push(s);
        });
        $s.selectedScale = scale.name;
    };
    $s.selectedScale = undefined;

    $s.configure = function () {
        if ($s.selectedTestPrototype === undefined) {
            return;
        }
        if ($s.selectedTestPrototype.checks && $s.selectedTestPrototype.checks.length >= 1) {
            $s.selectedTestPrototype.checks.forEach(function (entry) {
                var dom = $e[0].querySelector("[name=\"" + entry.name + "\"] input");
                if (entry.support == "none") {
                    dom.checked = false;
                    dom.disabled = true;
                }
            });
        }
        if ($s.selectedTestPrototype.show && $s.selectedTestPrototype.show.length >= 1) {
            $s.selectedTestPrototype.show.forEach(function (entry) {
                var dom = $e[0].querySelector("[name=\"" + entry.name + "\"] input");
                if (entry.support == "none") {
                    dom.checked = false;
                    dom.disabled = true;
                }
            });
        }
        if ($s.interface !== specification.interfaces) {
            // Page specific interface nodes
            if ($s.selectedTestPrototype.hasScales !== undefined && ($s.selectedTestPrototype.hasScales == "false" || $s.selectedTestPrototype.hasScales == false)) {
                var elem = $e[0].querySelector("[name=\"scale-selection\"]")
                elem.style.visibility = "hidden";
                elem.style.height = "0px";
            }
            if ($s.selectedTestPrototype.scales && $s.selectedTestPrototype.show.length >= 1) {
                $s.scales = [];
                $s.selectedTestPrototype.scales.forEach(function (scalename) {
                    var obj = $s.testSpecifications.scales.find(function (a) {
                        return a.name == scalename;
                    });
                    $s.scales.push(obj);
                });
                if ($s.selectedTestPrototype.scales.includes($s.selectedScale) == false) {
                    $s.clearScales();
                }
                if ($s.scales.length == 1) {
                    $s.clearScales();
                    $s.useScales($s.scales[0]);
                }
            } else {
                $s.scales = $s.testSpecifications.scales;
            }
        }
    };

    $s.$watch("selectedTestPrototype", $s.configure);
    $s.configure();
}]);
AngularInterface.controller("page", ['$scope', '$element', '$window', function ($s, $e, $w) {
    $s.schema = $w.specification.schema.querySelector("element[name=\"page\"]");
    $s.page.label = $s.page.label || "default";
    $s.addInterface = function () {
        $s.page.addInterface();
    };
    $s.removeInterface = function (node) {
        var index = $s.page.interfaces.findIndex(function (a) {
            return a == node;
        });
        if (index === -1) {
            throw ("Invalid node");
        }
        $s.page.interfaces.splice(index, 1);
    };

    $s.addCommentQuestion = function () {
        $s.page.addCommentQuestion();
    };
    $s.removeCommentQuestion = function (node) {
        var index = $s.page.commentQuestions.findIndex(function (a) {
            return a == node;
        });
        if (index === -1) {
            throw ("Invalid node");
        }
        $s.page.commentQuestions.splice(index, 1);
    };
    $s.addAudioElement = function () {
        $s.page.addAudioElement();
    };
    $s.ondrop = function (filename) {
        var fragment = $s.page.addAudioElement();
        fragment.url = filename;
    };
    $s.removeAudioElement = function (element) {
        var index = $s.page.audioElements.findIndex(function (a) {
            return a == element;
        });
        if (index === -1) {
            throw ("Invalid node");
        }
        $s.page.audioElements.splice(index, 1);
    };

    $s.placeholder = function (name) {
        var spec = $s.schema.querySelector("attribute[name=\"" + name + "\"]") || $w.specification.schema.querySelector("attribute[name=\"" + name + "\"]");
        var attr = spec.getAttribute("default");
        if (attr === null) {
            return "Not set";
        }
        return attr;
    }
}]);





