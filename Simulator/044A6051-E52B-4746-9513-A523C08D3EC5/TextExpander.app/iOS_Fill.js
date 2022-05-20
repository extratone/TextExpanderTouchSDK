
var formInUse = false;

function handleConditional(checkbox, n, dup) {
    var theDiv = document.getElementById("condPart" + n);
    theDiv.className = (checkbox.checked ? "condyes" : "condno");
    if (dup) {
        for (var i = 0; i < document.forms[0].elements.length; i++) {
            var element = document.forms[0].elements[i];
            if (element != checkbox && element.name == checkbox.name && element.type == 'checkbox') {
                element.checked = checkbox.checked;
                handleConditional(element, element.id, false);
            }
        }
    }
}

function handleDuplicates(field) {
    var newValue;
    if (field.type == 'select' || field.type == 'select-one') {
        newValue = field.options[field.selectedIndex].text;
    } else {
        newValue = field.value;
    }
    for (var i = 0; i < document.forms[0].elements.length; i++) {
        var element = document.forms[0].elements[i];
        if (element == field || (element.type != 'text' && element.type != 'textarea' && element.type != 'select' && element.type != 'select-one')) {
            continue;
        }
        if (element.name == field.name) {
            if (element.type == 'select' || element.type == 'select-one') {
                var prevSel = element.selectedIndex;
                var newSel = -1;
                for (var j = 0; j < element.length; j++) {
                    if (element.options[j].text == newValue) {
                        newSel = j;
                        break;
                    }
                }
                if (newSel != -1 && newSel != prevSel) {
                    element.selectedIndex = newSel;
                }
            } else {
                element.value = field.value;
            }
        }
    }
}

function setFocus() {
    if (!formInUse) {
        for (var i = 0; i < document.forms[0].elements.length; i++) {
            var element = document.forms[0].elements[i];
            if (element.type == 'text' || element.type == 'textarea') {
                element.focus();
                formInUse = true;
                break;
            }
        }
    }
    var syncd = new Array();
    for (var i = 0; i < document.forms[0].elements.length; i++) {
        var anInput = document.forms[0].elements[i];
        var aName = anInput.name;
        if (syncd.indexOf(aName) == -1) {
            if (anInput.type == 'checkbox') {
                handleConditional(anInput, anInput.id, true);
            } else {
                handleDuplicates(anInput);
            }
            syncd.push(aName);
        }
    }
}

function setupDisclosureTriangle(hideContent) {
    triangle = document.getElementById("disclosureTriangle");
    triangle.onclick = function() {
        disclosedContent = document.getElementById("disclosedContent");
        if (disclosedContent.className.indexOf("hidden") != -1) {
            triangle.className = 'disclosureTriangle disclosureTriangleOpen';
            disclosedContent.className = disclosedContent.className.replace("hidden", "");
        } else {
            triangle.className = 'disclosureTriangle disclosureTriangleClosed';
            disclosedContent.className += " hidden";
        }
    };
    if (hideContent) {
        triangle.className = 'disclosureTriangle disclosureTriangleClosed';
        disclosedContent.className += " hidden";
    } else {
        triangle.className = 'disclosureTriangle disclosureTriangleOpen';
    }
}
