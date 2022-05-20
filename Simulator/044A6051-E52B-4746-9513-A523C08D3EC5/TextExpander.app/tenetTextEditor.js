var editor;
var editorDelegate;
var imageImportDelegate;
var fillinDelegate;
var tabFocusOutDelegate;
var editorLogDelegate;
var previewDelegate;
var _suspendSelectionBasedEditorListeners = false;

function preventDefault(event) {
  event.preventDefault();

  return false;
}

var realConsole = console;
var console = {};
console.log = function(message) {
  if (editorLogDelegate) {
    editorLogDelegate.editorLog(message);
  }
  realConsole.log(message);
};

(function(focusForModals, $, undefined) {
  'use strict';

  $('#prompt-for-url-modal').on('shown.bs.modal', function(e) {
    $('#url-input').focus();
  })
  $('#filltext-modal').on('shown.bs.modal', function(e) {
    $('#fill-text-name').focus();
  });


  $('#fillarea-modal').on('shown.bs.modal', function(e) {
    $('#fill-area-name').focus();
  });

  $('#fillpart-modal').on('shown.bs.modal', function(e) {
    $('#fillpart-name').focus();
  });

  $('#fillpopup-modal').on('shown.bs.modal', function(e) {
    $('#fillpop-name').focus();
  });

  $('#insert-snippet-modal').on('shown.bs.modal', function(e) {
    $('#insert-snippet-abbreviation-field').focus();
  });

  $('#insert-table-modal').on('shown.bs.modal', function(e) {
    $('#insert-table-columns-field').focus();
  });

})(window.focusForModals = window.focusForModals || {}, jQuery);

function resetEditor() { // hide "modal" overlays. Should any other things get reset here?
  $('#prompt-for-url-modal').modal('hide');
  $('#filltext-modal').modal('hide');
  $('#fillarea-modal').modal('hide');
  $('#fillpart-modal').modal('hide');
  $('#fillpopup-modal').modal('hide');
  $('#insert-table-modal').modal('hide');
}

(function(dropdownBehavior, $, undefined) {
  var abbreviationCaseElement = document.getElementById('snippet-field-abbreviation-case');
  var contentTypeElement = document.getElementById('snippet-field-content-type');

  /*
   There is a toggle method we should be able to use instead of the class removal
   but it's behavior seems to be pretty erratic. According to bootstrap's documenation
   checking for the open class is a reasonable approach. There are multiple bugs
   filed on bootstrap's git about toggle so this seems like the better approach for now.
   */

  dropdownBehavior.dismissBootstrapDropdowns = function() {
    var openElements = document.getElementsByClassName('open');
    for (var i = 0; i < openElements.length; i++) {
      var element = openElements[i];
      var elementClasses = element.className
      elementClasses = elementClasses.replace(/open/i, '');
      element.className = elementClasses;
    }
  }

  $('.btn').on('click', function(e) {
    $('#color-picker').spectrum('hide');
  });

})(window.dropdownBehavior = window.dropdownBehavior || {}, jQuery);

(function(fillins, $, undefined) {
  'use strict';

  //show fill modal
  $('.btn-fill-in').on('click', function() {
    editor.removeEventListener('select', fillins.editFillin, false);

    var fillin = $(this).attr('js-fillin');
    var selection = editor.getSelection();
    var startOffset = selection.startOffset;
    editor.insertHTML(fillin);

    if (fillinDelegate) {
      fillinDelegate.snippetFillinStatusChanged(editor.getHTML());
    }
    var startContainer = selection.startContainer;
    var endContainer = selection.endContainer;

    var nodes = [];
    var children = selection.endContainer.childNodes;
    var nodes = Array.prototype.slice.call(children);
    nodes = nodes.concat(startContainer.nextSibling, startContainer.previousSibling);

    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i]

      if (node) {
        var contentText = node.contentText;

        if (node.nodeName === '#text' && node.textContent === fillin) {
          endContainer = node;
          startContainer = node;
          startOffset = 0;
        }
      }
    }

    selection.setStart(startContainer, startOffset);
    selection.setEnd(endContainer, startOffset + fillin.length);
    editor.setSelection(selection);

    fillins.editFillin(fillin);
  });

  //fill in methods
  function createFillin(nameOfFillin, modalID) {
    $('#' + modalID).modal('hide');

    var fillin = '%' + nameOfFillin;
    var fillinFieldClassName = 'js-' + nameOfFillin + '-field';
    var fillinFieldElements = document.getElementsByClassName(fillinFieldClassName);
    var radioElements = document.getElementsByClassName('js-' + nameOfFillin + '-radio');
    var radioElementsCounter = 0;
    for (var i = 0; i < fillinFieldElements.length; i++) {
      var element = fillinFieldElements[i];
      var propertyName = element.getAttribute('fillin-property-name');
      var emptyPropertyName = element.getAttribute('fillin-property-name-if-no-value');
      var propertyValue = element.value;

      if (element.type === 'checkbox') {
        propertyValue = element.checked ? 'yes' : 'no';
      }
      if (element.type == 'text' || element.type == 'textarea') {
        if (propertyValue.length > 0) {
          propertyValue = $("<div>").text(propertyValue).html();
        }
      }

      if (propertyValue.length > 0) {
        fillin = fillin + propertyName;
      } else if (emptyPropertyName) {
        fillin = fillin + emptyPropertyName;
      }

      if (radioElements.length > 0 && emptyPropertyName) { //we have a popup with radio boxes
        var radioElement = radioElements[radioElementsCounter];

        if (radioElement.checked) {
          fillin = fillin + 'default=';
        }
        radioElementsCounter++;
      }

      fillin = fillin + propertyValue;
    }
    if (nameOfFillin === 'fillpart') {
      fillin = fillin + '%fillpartend';
    }
    fillin = fillin + '%';
    editor.insertHTML(fillin);
    modalHelpers.clearModalFields();
  }

  function deleteFillin(modalID) {
    $('#' + modalID).modal('hide');
    editor.insertHTML('');

    if (fillinDelegate) {
      fillinDelegate.snippetFillinStatusChanged(editor.getHTML());
    }
  }

  function insertPopupField(event) {
    var radioGroup = document.createElement('div');
    radioGroup.className = 'form-group js-remove-when-resetting-modal';

    var label = document.createElement('label');
    label.className = 'col-xs-1 col-sm-3 control-label';
    label.placeholder = 'New Option';

    var radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'popup-option-default';
    radio.className = 'js-fillpopup-radio';

    var textDiv = document.createElement('div');
    textDiv.className = 'col-xs-11 col-sm-8';

    var text = document.createElement('input');
    text.type = 'text';
    text.className = 'form-control js-fillpopup-field js-validate-input';
    text.placeholder = 'New option';
    text.setAttribute('fillin-property-name', ':');
    text.setAttribute('fillin-property-name-if-no-value', ':');

    label.appendChild(radio);
    textDiv.appendChild(text);
    radioGroup.appendChild(label);
    radioGroup.appendChild(textDiv);
    var addRemoveDiv = document.getElementById('fillpopup-add-remove-div');
    var radioContainer = document.getElementById('fillpopup-radio-container');
    radioContainer.removeChild(addRemoveDiv);
    radioContainer.appendChild(radioGroup);
    radioContainer.appendChild(addRemoveDiv);
  }

  function removePopupField(event) {
    var deleteButton = event.currentTarget;
    var radioContainer = document.getElementById('fillpopup-radio-container');
    var radios = radioContainer.getElementsByClassName('js-remove-when-resetting-modal');

    if (radios.length > 0) {
      radioContainer.removeChild(radios[radios.length - 1]);
    }
  }

  fillins.selectedFillin = function() {
    var selection = editor.getSelection();

    var selectedText = editor.getSelectedText();
    var wholeText = selection.startContainer.wholeText;

    if (wholeText !== undefined) {
      var endOfSelection = selection.endOffset;
      var firstPart = wholeText.substr(0, endOfSelection);
      var fillinStartText = '%fill';

      if (selectedText === 'fillpartend') {
        fillinStartText = '%fillpart:'
      }

      var indexOfFillinStart = firstPart.lastIndexOf(fillinStartText);

      if (indexOfFillinStart >= 0) {
        var possibleFillin = wholeText.substr(indexOfFillinStart + 1); // Add one chops string right after % so we can search for the next %
        var isFillPart = possibleFillin.indexOf('fillpart')
        var fillinEndText = '%';
        if (isFillPart == 0) {
          fillinEndText = '%fillpartend%';
        }
        var indexOfFillinEnd = possibleFillin.indexOf(fillinEndText);

        if (indexOfFillinEnd >= 0) {
          // Add 2 because we -1 for first percent, and because index of is where the % starts, we want to include it.
          var endForLoggingFillin = indexOfFillinEnd + fillinEndText.length + 1;
          indexOfFillinEnd = indexOfFillinEnd + fillinEndText.length + 1 + indexOfFillinStart;
          possibleFillin = wholeText.substr(indexOfFillinStart, endForLoggingFillin);

          if (selection.startOffset <= indexOfFillinEnd && selection.startOffset >= indexOfFillinStart && selection.endOffset <= indexOfFillinEnd && selection.endOffset >= indexOfFillinStart) {
            var startContainer = selection.startContainer;
            selection.setStart(startContainer, indexOfFillinStart);
            selection.setEnd(startContainer, indexOfFillinEnd);
            editor.setSelection(selection);
            return possibleFillin;
          }
        }
      }
    }
  }

  fillins.editFillin = function(fillinText) {

    if (!_suspendSelectionBasedEditorListeners) {
      if (typeof fillinText != 'string') { //not a string if fired by an event listener
        fillinText = fillins.selectedFillin();
      }
      if (fillinText) {
        editor.removeEventListener('select', fillins.editFillin, false);

        var nameOfFillin;
        if (fillinText.indexOf('%filltext', 0) === 0) {
          nameOfFillin = 'filltext';
        } else if (fillinText.indexOf('%fillarea', 0) === 0) {
          nameOfFillin = 'fillarea';
        } else if (fillinText.indexOf('%fillpopup', 0) === 0) {
          nameOfFillin = 'fillpopup';
        } else if (fillinText.indexOf('%fillpart', 0) === 0) {
          nameOfFillin = 'fillpart';
        }

        fillinText = fillinText.replace('%' + nameOfFillin, '');

        if (nameOfFillin == 'fillpopup') { // count : to see how many menu items to add
          var numberOfMenuItems = (fillinText.match(/:/g) || []).length;

          if (fillinText.indexOf(':name', 0) === 0) {
            numberOfMenuItems = numberOfMenuItems - 1;
          }

          for (var counter = 1; counter < numberOfMenuItems; counter++) {
            insertPopupField();
          }
        }

        var fillinFieldClassName = 'js-' + nameOfFillin + '-field';
        var fillinFieldElements = document.getElementsByClassName(fillinFieldClassName);
        var radioElements = document.getElementsByClassName('js-' + nameOfFillin + '-radio');
        var radioElementsCounter = 0;

        for (var i = 0; i < fillinFieldElements.length; i++) {
          var element = fillinFieldElements[i];
          var propertyName = element.getAttribute('fillin-property-name');
          var emptyPropertyName = element.getAttribute('fillin-property-name-if-no-value');

          if (nameOfFillin == 'fillpopup' && emptyPropertyName) {
            if (fillinText.indexOf(':default=', 0) === 0) {
              var radioElement = radioElements[radioElementsCounter];
              radioElement.checked = true;
              fillinText = fillinText.replace(':default=', ':');
              //above we replace :default= with : so the next propertyName check passes
              //and we grab the fill in value.
            }
            radioElementsCounter++;
          }
          if (fillinText.indexOf(propertyName, 0) === 0) {
            fillinText = fillinText.replace(propertyName, '');
            var indexOfPropertyValueEnd = fillinText.indexOf(':');

            if (indexOfPropertyValueEnd == -1) {
              indexOfPropertyValueEnd = fillinText.indexOf('%');
            }
            var propertyValue = fillinText.slice(0, indexOfPropertyValueEnd);
            fillinText = fillinText.replace(propertyValue, '');
            if (element.type === 'checkbox') {
              element.checked = propertyValue === 'yes' ? true : false;
            } else {
              element.value = propertyValue;
            }
          }
        }
        $('#' + nameOfFillin + '-modal').modal('show');
      }
    }
  }

  $('.js-fillin-modal').on('hidden.bs.modal', function(event) {
    modalHelpers.clearModalFields();

    var selection = editor.getSelection();
    var startContainer = selection.startContainer;
    var endOffset = selection.endOffset;
    selection.setStart(startContainer, endOffset);
    selection.setEnd(startContainer, endOffset);
    editor.setSelection(selection);
  })

  $(window).load(function() {
    //selectors
    var fillTextOkButton = document.getElementById('filltext-ok-button');
    var fillTextDeleteButton = document.getElementById('filltext-delete-button');
    var fillAreaOkButton = document.getElementById('fillarea-ok-button');
    var fillAreaDeleteButton = document.getElementById('fillarea-delete-button');
    var fillpartOkButton = document.getElementById('fillpart-ok-button');
    var fillpartDeleteButton = document.getElementById('fillpart-delete-button');
    var fillpopupOkButton = document.getElementById('fillpopup-ok-button');
    var fillpopupDeleteButton = document.getElementById('fillpopup-delete-button');
    var fillpopupAddRowButton = document.getElementById('fillpopup-add-row-button');
    var fillpopupDeleteRowButton = document.getElementById('fillpopup-delete-row-button');

    var elementsNeedingInputValidation = document.getElementsByClassName('js-validate-input');

    //events
    var filltext = 'filltext';
    var filltextModal = 'filltext-modal';
    fillTextOkButton.addEventListener('click', createFillin.bind(null, filltext, filltextModal), false);
    fillTextDeleteButton.addEventListener('click', deleteFillin.bind(null, filltextModal), false);
    var fillarea = 'fillarea';
    var fillareaModal = 'fillarea-modal';
    fillAreaOkButton.addEventListener('click', createFillin.bind(null, fillarea, fillareaModal), false);
    fillAreaDeleteButton.addEventListener('click', deleteFillin.bind(null, fillareaModal), false);
    var fillpart = 'fillpart';
    var fillpartModal = 'fillpart-modal';
    fillpartOkButton.addEventListener('click', createFillin.bind(null, fillpart, fillpartModal), false);
    fillpartDeleteButton.addEventListener('click', deleteFillin.bind(null, fillpartModal), false);
    var fillpopup = 'fillpopup';
    var fillpopupModal = 'fillpopup-modal';
    fillpopupOkButton.addEventListener('click', createFillin.bind(null, fillpopup, fillpopupModal), false);
    fillpopupDeleteButton.addEventListener('click', deleteFillin.bind(null, fillpopupModal), false);
    fillpopupAddRowButton.addEventListener('click', insertPopupField, false);
    fillpopupDeleteRowButton.addEventListener('click', removePopupField, false);

    for (var i = 0; i < elementsNeedingInputValidation.length; i++) {
      elementsNeedingInputValidation[i].addEventListener('input', modalHelpers.validateModalInput, false);
    }

    var snippetPropertyElements = document.getElementsByClassName('js-snippet-property');

    for (var counter = 0; counter < snippetPropertyElements.length; counter++) {
      var element = snippetPropertyElements[counter];
      var event = element.getAttribute('js-content-change-event');
      element.addEventListener(event, snippetChangedBroadcast.snippetChanged.bind(null, element), false);
    }

    var snippetContentTypeElement = document.getElementById('snippet-field-content-type');
    snippetContentTypeElement.addEventListener('change', snippetChangedBroadcast.snippetContentTypeChanged.bind(null, snippetContentTypeElement), false);
    // override Shift-Tab -- as first logical tab focus cycle item, we want Shift-Tab from
    // this 'first' item to move focus out of snippet editor and into previous window element
    snippetContentTypeElement.addEventListener('keydown', function(event) {
      if (tabFocusOutDelegate) {
        var key = event.key;
        if (key === undefined) { //Different browsers use different names for this one
          key = event.keyIdentifier;
        }
        if (key === 'U+0009' && !event.altKey && !event.metaKey && !event.ctrlKey && event.shiftKey) {
          event.preventDefault();
          snippetContentTypeElement.blur();
          tabFocusOutDelegate.tabFocusOut('backward');
        }
      }
    });

    // override Tab -- as last logical tab focus cycle item, we want Tab from this 'last' item to move focus
    // out of snippet editor and into next window element
    var abbreviationModeElement = document.getElementById('snippet-field-abbreviation-case');
    abbreviationModeElement.addEventListener('keydown', function(event) {
      if (tabFocusOutDelegate) {
        var key = event.key;
        if (key === undefined) { //Different browsers use different names for this one
          key = event.keyIdentifier;
        }
        if (key === 'U+0009' && !event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
          event.preventDefault();
          abbreviationModeElement.blur();
          tabFocusOutDelegate.tabFocusOut('forward');
        }
      }
    });
  });
})(window.fillins = window.fillins || {}, jQuery);

(function(modalHelpers, $, undefined) {

  modalHelpers.clearModalFields = function() {
    var fillinFieldClassName = 'js-validate-input';
    var fillinFieldElements = document.getElementsByClassName(fillinFieldClassName);
    for (var i = 0; i < fillinFieldElements.length; i++) {
      var element = fillinFieldElements[i];
      element.value = '';
      element.checked = false;
    }

    var fieldsToRemove = document.getElementsByClassName('js-remove-when-resetting-modal');
    while (fieldsToRemove.length > 0) {
      var field = fieldsToRemove[0];
      var parent = field.parentNode;
      parent.removeChild(field);
    }

    var radioFieldsToCheck = document.getElementsByClassName('js-fillpopup-radio');
    for (i = 0; i < radioFieldsToCheck.length; i++) {
      var radioField = radioFieldsToCheck[i];
      radioField.checked = true;
    }

    var urlInput = document.getElementById('url-input');
    urlInput.value = '';
    var fillpartcheckbox = document.getElementById('fillpart-checkbox');
    fillpartcheckbox.checked = true;
  }

  modalHelpers.validateModalInput = function(event) {
    var element = event.currentTarget;
    var value = element.value;

    //number input fields don't restrict non number input, they just ignore non number input when returning value.
    //we want to be sure if the length is 0 that there aren't actually any non-number characters in the field's value

    //a bug in chrome prevents us from setting the caret position in number inputs.
    //https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/setSelectionRange

    if (parseInt(value, 10) > parseInt(element.max, 10)) { //we want to be sure that number values for things like stroke aren't un manageble.
      value = value.substr(0, 2);
    }
    if (element.type === 'number' && !/[0-9]/.test(value)) {
      value = '';
    } else if (element.type !== 'number') {
      value = value.replace(/:/i, '-');
      value = value.replace(/%/i, '/');
      var start = element.selectionStart;
      var end = element.selectionEnd;
      value = value;
    }

    if (value != element.value) {
      element.value = value;
      element.setSelectionRange(start, end);
    }
  }

})(window.modalHelpers = window.modalHelpers || {}, jQuery);

(function(tables, $, undefined) {

  tables.showTableModal = function(modalID) {
    var table = selectedTable();
    editTable(table);
    $('#' + modalID).modal('show');
  }

  function insertTable() {
    $('#insert-table-modal').modal('hide');

    var rowsInput = document.getElementById('insert-table-rows-field');
    var rows = rowsInput.value;
    var columnInput = document.getElementById('insert-table-columns-field');
    var columns = columnInput.value;
    var strokeInput = document.getElementById('insert-table-stroke-field');
    var stroke = strokeInput.value === undefined ? '0' : strokeInput.value;
    var headerCheckbox = document.getElementById('insert-table-header-checkbox');
    var hasHeader = headerCheckbox.checked;

    var table = selectedTable();
    if (table) {
      editExistingTable(table, rows, columns, stroke, hasHeader);
    } else {
      var tableString = tables.buildTable(rows, columns, stroke, hasHeader);
      editor.insertHTML(tableString);
    }
    modalHelpers.clearModalFields();
  }

  function insertRowWithStroke(tbody, stroke, index) {
    var row = tbody.insertRow(index);
    applyStrokeToTableElement(row, stroke);

    return row;
  }

  function applyStrokeToTableElements(elements, stroke) {
    for (var i = 0; i < elements.length; i++) {
      element = elements[i];
      applyStrokeToTableElement(element, stroke);
    }
  }

  function applyStrokeToTableElement(element, stroke) {
    var tableBorderCSS = ''; // terrible the next 3 lines are copyied from building tables
    if (stroke > 0) {
      tableBorderCSS = stroke + 'px solid black';
    }
    element.style.border = tableBorderCSS;
    element.style.padding = '0.5rem';
  }

  function insertCellsInRow(row, numberOfCells, isHeader, stroke) {
    var cellsToIterate = row.children.length > numberOfCells ? row.children.length : numberOfCells;

    for (var counter = 0; counter < cellsToIterate; counter++) {
      var cell = row.children[counter];
      if (numberOfCells <= 0) { //remove the cell
        row.removeChild(row.lastChild);
      } else {
        if (!cell) {
          if (isHeader) {
            cell = document.createElement('TH');
            row.appendChild(cell);
          } else {
            cell = row.insertCell();
          }
          br = document.createElement('BR');
          cell.appendChild(br);
        }
        applyStrokeToTableElement(cell, stroke);
      }
      --numberOfCells;
    }
  }

  function editExistingTable(table, numberOfRows, numberOfColumns, stroke, hasHeader) {

    var tableBorderCSS = ''; // terrible the next 3 lines are copyied from building tables
    if (stroke > 0) {
      tableBorderCSS = stroke + 'px solid black';
    }

    table.style.border = tableBorderCSS;
    var tbody = table.firstChild; //tbody
    var rows = tbody.children;

    //deal with first row which could be a header
    var headerFilter = function(node) {
      var nodeFilter = NodeFilter.FILTER_SKIP;
      if (node.tagName === 'TH') {
        nodeFilter = NodeFilter.FILTER_ACCEPT;
      }
      return nodeFilter;
    }
    var treeWalker = document.createTreeWalker(table, NodeFilter.SHOW_ALL, headerFilter, false);
    var headerColumn = treeWalker.nextNode();

    if (headerColumn && !hasHeader) { //remove the row. We don't want a header
      tbody.removeChild(tbody.firstChild);
    } else if (hasHeader) {
      var headerRow = rows[0];
      if (!headerColumn) {
        headerRow = insertRowWithStroke(tbody, stroke, 0);
      }
      insertCellsInRow(headerRow, numberOfColumns, true, stroke);
      applyStrokeToTableElements(headerRow.children, stroke);

    }
    var counter = hasHeader ? 1 : 0; //Start with second row if it's a header
    var existingRows = rows.length - counter; //remove the header from row count
    var rowsToIterate = existingRows > numberOfRows ? existingRows : numberOfRows;
    var stopCounterAt = (+rowsToIterate) + (+counter);
    //update table rows
    for (counter; counter < stopCounterAt; ++counter) {
      var row = rows[counter];
      if (numberOfRows <= 0) { //remove row
        tbody.removeChild(tbody.lastChild);
      } else { //we want the row
        if (!row) {
          row = insertRowWithStroke(tbody, stroke, counter);
        }
        applyStrokeToTableElement(row, stroke);
        insertCellsInRow(row, numberOfColumns, false, stroke);
      }
      --numberOfRows; //decriment rows as we count them off
    }
  }

  function treeWalkToTableFromChild(child) {

    findTableFilter = function(node) {
      var nodeFilter = NodeFilter.FILTER_SKIP;
      if (node.tagName === 'TABLE' && node.contains(child)) {
        nodeFilter = NodeFilter.FILTER_ACCEPT;
      }
      return nodeFilter;
    }
    var editorContainer = document.getElementById('editor-container');
    var treeWalker = document.createTreeWalker(editorContainer, NodeFilter.SHOW_ALL, findTableFilter, false);

    return treeWalker.nextNode();
  }

  function getTableFromContainerWithOffset(container, offset) {
    var table = undefined;
    var startNodeFirstChild = container.childNodes[offset];
    if (startNodeFirstChild.nodeName === 'TABLE') {
      table = startNodeFirstChild;
    }

    return table;
  }

  function findTableBetweenStartElemendAndEndElement(startElement, endElement) {
    var editorContainer = document.getElementById('editor-container');
    //if we started with the editor container it means we started highlighting at the top
    //That means the first table we hit we want to return.
    var passedStartNode = startElement === editorContainer ? true : false;

    findTableFilter = function(node) {
      var nodeFilter = NodeFilter.FILTER_SKIP;
      if (node === startElement) {
        passedStartNode = true;
      } else if (passedStartNode && node.tagName === 'TABLE') {
        nodeFilter = NodeFilter.FILTER_ACCEPT;
      } else if (node === endElement) {
        nodeFilter = NodeFilter.FILTER_REJECT;
      }
      return nodeFilter;
    }
    var treeWalker = document.createTreeWalker(editorContainer, NodeFilter.SHOW_ALL, findTableFilter, false);

    return treeWalker.nextNode();
  }

  function selectedTable() {
    var selection = editor.getSelection();
    var table = treeWalkToTableFromChild(selection.startContainer); //look down the start container for a table

    if (!table) { //look down the end container for a table
      table = treeWalkToTableFromChild(selection.endContainer);
    }
    if (!table && selection.startContainer.childNodes.length > 0) { // if we've got children try that from the start container
      table = getTableFromContainerWithOffset(selection.startContainer, selection.startOffset);
    }
    if (!table && selection.endContainer.childNodes > 0) { // if we've got children try that from the end container
      table = getTableFromContainerWithOffset(selection.endContainer, selection.endOffset);
    }
    if (!table) { //if everything else failed walk from the start container to the end looking for a table
      table = findTableBetweenStartElemendAndEndElement(selection.startContainer, selection.endContainer);
    }

    return table;
  }

  function editTable(theTable) {
    if (theTable) {
      var border = theTable.style.border;
      border = border.indexOf('px') === -1 ? '0' : border.substring(0, border.indexOf('px'));
      var tbody = theTable.childNodes[0];

      var numberOfRows = tbody.childNodes.length;
      var firstRow = tbody.childNodes[0];
      var numberOfCol = firstRow.childNodes.length;
      var thORTd = firstRow.childNodes[0];
      hasHeader = thORTd.nodeName === 'TH' ? true : false;

      if (hasHeader) { //One item that we counted as a row is really a header
        numberOfRows = numberOfRows - 1;
      }

      var rowsInput = document.getElementById('insert-table-rows-field');
      rowsInput.value = numberOfRows;
      var columnInput = document.getElementById('insert-table-columns-field');
      columnInput.value = numberOfCol;
      var strokeInput = document.getElementById('insert-table-stroke-field');
      strokeInput.value = border;
      var headerCheckbox = document.getElementById('insert-table-header-checkbox');
      headerCheckbox.checked = hasHeader;

      $('#insert-table-modal').modal('show');
    }
  }

  function countOccurancesOfSubstringInString(string, subString) {
    var numberOfOccurances = 0;
    var indexOfSubstring = string.indexOf(subString);

    while (indexOfSubstring !== -1) {
      numberOfOccurances++;
      indexOfSubstring = string.indexOf(subString, indexOfSubstring + 1);
    }

    return numberOfOccurances;
  }

  tables.buildTable = function(rows, columns, stroke, hasHeader) {
    var tdForEachRow = '';
    var tableBorderCSS = '';
    if (stroke > 0) {
      tableBorderCSS = 'border:' + stroke + 'px solid black; ';
    }
    var tablestyle = 'style="' + tableBorderCSS + 'padding: 0.5rem;"'
    var tableString = '<table ' + 'style="' + tableBorderCSS + 'border-collapse: collapse;"' + '>'; //make table base

    if (hasHeader) {
      var colCounter = columns;
      var tableHeader = "";
      while (colCounter > 0) {
        tableHeader = tableHeader + '<th ' + tablestyle + '></th>';
        --colCounter;
      }
      tableString = tableString + tableHeader;
    }

    while (columns > 0) { //get the content for each row ready
      tdForEachRow = tdForEachRow + '<td ' + tablestyle + '></td>';
      --columns;
    }

    while (rows > 0) { //insert each row
      tableString = tableString + '<tr ' + tablestyle + '>' + tdForEachRow + '</tr>'
        --rows;
    }

    tableString = tableString + '</table> ';
    return tableString;
  }

  var okTableButton = document.getElementById('insert-table-ok');
  okTableButton.addEventListener('click', insertTable, false);

  var cancelTableButton = document.getElementById('insert-table-cancel');
  cancelTableButton.addEventListener('click', modalHelpers.clearModalFields, false);
})(window.tables = window.tables || {}, jQuery);

(function(basicEditorFunctions, $, undefined) {

  basicEditorFunctions.defaultFontKeyForContentMode = function(contentMode) {
    return 'defaultFontKeyForSnippetContentMode' + contentMode;
  }


  basicEditorFunctions.setDefaultFontStyleForContentMode = function(contentMode) {
    var defaultFontKey = basicEditorFunctions.defaultFontKeyForContentMode(contentMode);
    var defaultFontFamilyForContentMode = sessionStorage.getItem(defaultFontKey);

    setDefaultFontStyle(defaultFontFamilyForContentMode);
  }

  function setDefaultFontStyle(defaultFontStyle) {
    //if there is no default we want to be sure we pass in the editor's generic font.
    defaultFontStyle = defaultFontStyle ? defaultFontStyle : "12px Helvetica, arial,serif";
    var editorDiv = document.getElementById('editor-container');
    editorDiv.style.font = defaultFontStyle;
  }

  function bold(event) {
    applyFormatting('B', 'bold', 'removeBold');
  }

  function italic(event) {
    applyFormatting('I', 'italic', 'removeItalic');
  }

  function underline(event) {
    applyFormatting('U', 'underline', 'removeUnderline');
  }

  function applyFormatting(formatter, addFormatFunction, removeFormatFunction) {
    _suspendSelectionBasedEditorListeners = true;
    var contains = editor.hasFormat(formatter);

    if (contains === true) {
      editor[removeFormatFunction]();
    } else {
      editor[addFormatFunction]();
      editor.focus();
    }
    _suspendSelectionBasedEditorListeners = false;

    toolbarButtonState.pathChanged();
  }

  function alignCenter(event) {
    _suspendSelectionBasedEditorListeners = true;
    editor.setTextAlignment('center');
    _suspendSelectionBasedEditorListeners = false;

  }

  function alignLeft(event) {
    _suspendSelectionBasedEditorListeners = true;
    editor.setTextAlignment('left');
    _suspendSelectionBasedEditorListeners = false;

  }

  function alignRight(event) {
    _suspendSelectionBasedEditorListeners = true;
    editor.setTextAlignment('right');
    _suspendSelectionBasedEditorListeners = false;
  }

  function makeLink(event) {
    $("#prompt-for-url-modal").modal("hide"); //hide

    var urlInput = document.getElementById('url-input');
    var url = urlInput.value;
    var httpIndex = url.indexOf("http://");
    var httpsIndex = url.indexOf("https://");
    var mailToIndex = url.indexOf("mailto:");
    var telIndex = url.indexOf("tel:");

    if (httpIndex !== 0 && httpsIndex !== 0 && mailToIndex !== 0 && telIndex !== 0) {
      url = "http://" + url; //without it appends the local file structure to the url
    }

    editor.makeLink(url);
    urlInput.value = ""; //clear
  }

  $("#prompt-for-url-modal").on('hidden.bs.modal', function() {
    $("#url-input")[0].value = "";
  });

  var boldElement = document.getElementById('B');
  var italicElement = document.getElementById('I');
  var underlineElement = document.getElementById('U');
  var rightElement = document.getElementById('align-right');
  var centerElement = document.getElementById('align-center');
  var leftElement = document.getElementById('align-left');
  var makeLinkElement = document.getElementById('makeLink');

  boldElement.addEventListener('click', bold, false);
  italicElement.addEventListener('click', italic, false);
  underlineElement.addEventListener('click', underline, false);
  rightElement.addEventListener('click', alignRight, false);
  centerElement.addEventListener('click', alignCenter, false);
  leftElement.addEventListener('click', alignLeft, false);
  makeLinkElement.addEventListener('click', makeLink, false);

  $('#font-size-list li a').on('click', function() {
    _suspendSelectionBasedEditorListeners = true;
    var fontNumber = $(this).text();
    editor.setFontSize(fontNumber + 'px');
    _suspendSelectionBasedEditorListeners = false;

    toolbarButtonState.updateFontSizeButtonWithSize(fontNumber);
  });

  $("#files-label").on('click', function(event) {
    if (imageImportDelegate) {
      imageImportDelegate.promptUserToSelectPhoto();
      event.preventDefault();
    }
  })

  $("#preview-button").on('click', function(event) {
    if (previewDelegate) {
      previewDelegate.showPreview();
      event.preventDefault();
    }
  })

  $(document).on('change', '#file', function() {
    var input = $(this);

    var fileObjectList = input.get(0).files;
    var singleFile = fileObjectList[0];
    var fileReader = new FileReader();

    fileReader.onload = (function(theFile) {

      return function(singleFile) {
        var imageStuff = singleFile.target.result;
        myText = '<img class="thumb" src="' + imageStuff + '" title="' + escape(singleFile.name) + '"/>';
        editor.insertHTML(myText);
        snippetChangedBroadcast.editorContentChanged(editor);
      };
    })(singleFile);
    fileReader.readAsDataURL(singleFile);
  });
})(window.basicEditorFunctions = window.basicEditorFunctions || {}, jQuery);

(function(variableFormatting, $, undefined) {

  function insertMovementOrDelimeterFormat(selectedItem) {
    var selectedItemText = selectedItem.text();
    var editorHTML = editor.getHTML();

    if (selectedItemText.indexOf('Delimeter') > -1) {
      var newEditorHTML;

      if (editorHTML.indexOf('%-') > -1) {
        newEditorHTML = editorHTML.replace('%-', '');
      } else if (editorHTML.indexOf('%+') > -1) {
        newEditorHTML = editorHTML.replace('%+', '');
      }
      if (newEditorHTML) {
        editorHTML = newEditorHTML;
        editor.setHTML(editorHTML);
      }
    }
    var variableFormat = selectedItem.attr('data-variableFormat');
    if (variableFormat !== '%|') {
      editor.moveCursorToEnd();
    }
    applyVariableFormatting(selectedItem);
  }

  function applyVariableFormatting(selectedItem) {
    var variableFormat = selectedItem.attr('data-variableFormat');
    if (variableFormat !== undefined) {
      editor.insertHTML(variableFormat);
    }
  }

  $('#special-character-list li a').on('click', function() {
    var modalID = $(this).attr('js-modal-id');
    if (modalID === 'insert-table-modal') {
      tables.showTableModal(modalID);
    } else {
      applyVariableFormatting($(this));
    }
  });

  $('#variableFormatDropdownMenu li a').on('click', function() {
    applyVariableFormatting($(this));
  });

  $('#delimeterVariableFormatDropdownMenu li a').on('click', function() {
    insertMovementOrDelimeterFormat($(this));
  });
})(window.variableFormatting = window.variableFormatting || {}, jQuery);

(function(accessibility, $, undefined) {

  $(document).on('shown.bs.modal', function(event) {
    editor.removeEventListener('select', fillins.editFillin, false);
  });
  $(document).on('hidden.bs.modal', function(event) {
    editor.addEventListener('select', fillins.editFillin, false);
  });

  $(document).on('hidden.bs.modal', function(event) {
    setTimeout(function() {
      editor.focus();
    }, 100);
  });

  // On dropdown open
  $(document).on('shown.bs.dropdown', function(event) {
    var dropdown = $(event.target);
    // Set aria-expanded to true
    dropdown.find('.dropdown-menu').attr('aria-expanded', true);

    // Set focus on the first link in the dropdown
    setTimeout(function() {
      dropdown.find('.dropdown-menu li:first-child a').focus();
    }, 10);
  });

  // On dropdown close
  $(document).on('hidden.bs.dropdown', function(event) {
    var dropdown = $(event.target);

    // Set aria-expanded to false
    dropdown.find('.dropdown-menu').attr('aria-expanded', false);

    // Set focus back to dropdown toggle
    // dropdown.find('.dropdown-toggle').focus();
    //The above action is proper handling for accessibility. The below works better with typing workflow.
    //If accessibility becomes an issue we should resume adding focus back to the drop down.
    editor.focus();
  });
})(window.accessibility = window.accessibility || {}, jQuery);

(function(toolbarButtonState, $, undefined) {

  toolbarButtonState.updateFontSizeButtonWithSize = function updateFontSizeButtonWithSize(fontSize) {
    if (fontSize === undefined) {
      var editorDiv = document.getElementById('editor-container');
      var style = window.getComputedStyle(editorDiv, null).getPropertyValue('font-size');
      var fontSize = parseFloat(style);
    } else {
      fontSize = fontSize.replace(/px/i, '');
    }
    sizeButton = document.getElementById('font-size-button');
    sizeButton.innerHTML = fontSize + " " + '<span class="caret"></span><span class="sr-only">font size</span>';
  }

  setInterval(function() {
    checkPathForFontChanges();
    selectFormattingButtons();
  }, 2000);

  function checkPathForFontChanges() {
    if (!_suspendSelectionBasedEditorListeners) {
      var fontInfoDictionary = editor.getFontInfo();
      updateFontButtonWithFontInfo(fontInfoDictionary);
    }
  }

  function selectFormattingButtons() {
    if (!_suspendSelectionBasedEditorListeners) {
      resetFormattingButtonSelection();

      var buttons = document.getElementsByClassName('js-html-formatting-required');

      for (var counter = 0; counter < buttons.length; counter++) {
        var button = buttons[counter];
        var id = button.id;

        if (editor.hasFormat(id)) {
          button.style.backgroundColor = '#e6e6e6';
        }
      }
    }
  }

  function resetFormattingButtonSelection() {
    var buttons = document.getElementsByClassName('js-html-formatting-required');
    for (var counter = 0; counter < buttons.length; counter++) {
      var button = buttons[counter];
      button.style.backgroundColor = '#fafafa';
    }
  }

  function updateFontButtonWithFontInfo(fontInfoDictionary) {
    var fontColor = fontInfoDictionary['color'];
    updateFontColorButtonWithColor(fontColor);
    var size = fontInfoDictionary['size'];
    toolbarButtonState.updateFontSizeButtonWithSize(size);
  }

  function updateFontColorButtonWithColor(fontColor) {
    if (fontColor === undefined) {
      fontColor = 'rgb(0, 0, 0)';
    }
    //only update if it's not hidden. Otherwise we are in the process of selecting a color.
    //spectrum doesnt have a simple getter to see if it's currently showing.
    var hiddenSpectrumColorPicker = document.getElementsByClassName('sp-hidden');
    if (hiddenSpectrumColorPicker.length == 1) {
      $("#color-picker").spectrum('set', fontColor);
    }
  }

  toolbarButtonState.pathChanged = function(event) {
    checkPathForFontChanges();
    selectFormattingButtons();
  }

  toolbarButtonState.checkForArrowKeyDowns = function(event) {
    var key = event.key;
    if (key === undefined) { //Different browsers use different names for this one
      key = event.keyIdentifier;
    }
    if (key === 'Up' || key === 'Down' || key === 'Left' || key === 'Right') {
      checkPathForFontChanges();
    }
  }

})(window.toolbarButtonState = window.toolbarButtonState || {}, jQuery);

(function(snippetChangedBroadcast, $, undefined) {
  var previousSnippetContent = '<p><br></p>';

  function adjustToolbarForWindow() {
    var width = window.innerWidth;
    var firstToolbar = document.getElementById('js-first-toolbar');
    var floatDirection = 'left';

    if (width >= 768) {
      floatDirection = 'right';
    }

    firstToolbar.style.setProperty('float', floatDirection, 'important');
  }
  window.onresize = adjustToolbarForWindow;
  window.onload = adjustToolbarForWindow;

  snippetChangedBroadcast.snippetContentTypeChanged = function(element) {
    var contentMode = element.value;
    var newEditorContent = '';

    if (contentMode == 2) { //apple
      newEditorContent = 'on textexpander(abbreviation) <br>return "Expansion for " & abbreviation <br>end textexpander';
    } else if (contentMode == 3) { //shell
      newEditorContent = '#! /bin/bash <br> echo "asd"';
    } else if (contentMode == 4) { //java
      newEditorContent = "// Use the TextExpander object to appendOutput() or adjust date and time,<br>// or just use the final statement as the snippet's expansion value, e.g.'Java' + 'Script' + ' result';";
    }
    var snippetContentText = editor.getHTML();

    if (snippetContentText === '<p><br></p>') {
      editor.setHTML(newEditorContent);
    }

    if (contentMode != 5) { //disable formatting
      var editorDiv = document.getElementById('editor-container');
      var squireTextContent = editorDiv.innerText;
      setSnippetContentTextWithEscaping(squireTextContent);
    }
    prepareToolbarForEditingMode(contentMode);
    adjustToolbarForWindow();

    //check for and apply default fonts
    basicEditorFunctions.setDefaultFontStyleForContentMode(contentMode);

    //manually broadcasting content changed because snippet objects should
    //resave content in format with new type
    snippetContentText = editor.getHTML();
    if (editorDelegate && snippetContentText !== '<p><br></p>') {
      editorDelegate['snippetContentTextChanged'](getSnippetSmart()['ContentText']);
    }
  };

  snippetChangedBroadcast.editorContentChanged = function(editor) {
    var newSnippetContentText = editor.getHTML();
    if (previousSnippetContent !== newSnippetContentText) {

      previousSnippetContent = newSnippetContentText;

      if (editorDelegate) {
        // manually broadcasting content type changed to ensure this wasn't changed out
        // from under us; do this before calling snippetContentTextChanged
        // see TextExpander #1497
        var snippetContentTypeElement = document.getElementById('snippet-field-content-type');
        editorDelegate['snippetContentTypeChanged'](snippetContentTypeElement.value);
        editorDelegate['snippetContentTextChanged'](getSnippetSmart()['ContentText']);
      }
    }
  };

  snippetChangedBroadcast.snippetChanged = function(element) {
    var newSnippetProperty = element.value;
    var delegateMethodName = 'snippet' + element.getAttribute('js-snippet-property-name') + 'Changed';

    if (editorDelegate) {
      editorDelegate[delegateMethodName](newSnippetProperty);
    }
  };

  snippetChangedBroadcast.setPreviousSnippetContent = function(previousContent) {
    previousSnippetContent = previousContent;
  }
})(window.snippetChangedBroadcast = window.snippetChangedBroadcast || {});

(function(snippetInsertion, $, undefined) {

  var insertSnippetButton = document.getElementById('insert-snippet-button');
  insertSnippetButton.addEventListener('click', function() {
    $('#insert-snippet-modal').modal('show');
  });

  var insertSnippetOkButton = document.getElementById('insert-snippet-ok');
  insertSnippetOkButton.addEventListener('click', insertSnippet, false);

  function insertSnippet() {
    $('#insert-snippet-modal').modal('hide');

    var snippetAbbreviationField = document.getElementById('insert-snippet-abbreviation-field');
    var abbreviation = snippetAbbreviationField.value;
    var snippet = '%snippet:' + abbreviation + '%';

    editor.insertHTML(snippet);
  }

  $('#insert-snippet-modal').on('hidden.bs.modal', function() {
    var snippetAbbreviationField = document.getElementById('insert-snippet-abbreviation-field');
    snippetAbbreviationField.value = '';
  });

})(window.snippetInsertion = window.snippetInsertion || {}, jQuery);

function prepareToolbarForEditingMode(contentMode) {
  var elements = document.getElementsByClassName('js-html-formatting-required');

  for (var counter = 0; counter < elements.length; counter++) {
    var element = elements[counter];
    var displayMode = 'none';

    if (contentMode == 5) { //enable formatting for html editing
      if (element.nodeName === 'LI') {
        displayMode = 'inline';
      } else {
        displayMode = 'inline-block';
      }
    }
    element.style.display = displayMode;
  }

  var firstToolbar = document.getElementById('left-toolbar-col');
  firstToolbar.style.display = displayMode;
  adjustEditorHeight();
}

function adjustEditorHeight() {
  var editorRow = document.getElementById('editor-row');

  var totalHeight = 0;
  $(editorRow).parent().find('> :visible').each(function() {
    totalHeight += $(this).outerHeight(true);
  });

  // take into account the margin, border and padding of the editor itself.
  totalHeight -= $(editorRow).height();

  var newHeight = 'height: calc(100% - ' + totalHeight + 'px);';
  editorRow.setAttribute('style', newHeight);
}

// Public API

function showPreviewButton(show) {
  if (show) {
    newDisplay = 'inline-block';
    newWidth = '90%';
  } else {
    newDisplay = 'none';
    newWidth = '100%';
  }

  var contentPopup = document.getElementsByClassName('js-content-popup');
  contentPopup[0].style.width = newWidth

  var previewButtonGroup = document.getElementsByClassName('js-preview-button-group');
  previewButtonGroup[0].style.display = newDisplay;
}

function setDefaultFontStyleForSnippetContentMode(defaultFont, snippetContentMode) {
  var defaultFontKey = basicEditorFunctions.defaultFontKeyForContentMode(snippetContentMode)
  sessionStorage.setItem(defaultFontKey, defaultFont);

  var contentTypeSelector = document.getElementById('snippet-field-content-type');
  basicEditorFunctions.setDefaultFontStyleForContentMode(contentTypeSelector.value);
}

function setFontList(arrayOfFontNames) {
  //populate text dropdown
  var list = document.getElementById("fontDropdownMenu");
  while (list.firstChild) {
    list.removeChild(list.firstChild);
  }


  for (var counter = 0; counter < arrayOfFontNames.length; counter++) {
    var fontName = arrayOfFontNames[counter];
    var text = document.createTextNode(fontName);
    var link = document.createElement("a");
    link.appendChild(text);
    link.href = "#";
    var li = document.createElement("li");

    li.appendChild(link);
    list.appendChild(li);
    link.addEventListener('click', setFont.bind(null, link), false)
  }
}

function setFont(element) {
  _suspendSelectionBasedEditorListeners = true;
  var selectedFontName = element.text;
  editor.setFontFace(selectedFontName);
  _suspendSelectionBasedEditorListeners = false;

}

var storedGroupDelegate = null;

function setGroupDelegate(groupDelegate) {
  storedGroupDelegate = groupDelegate;

  var groups = $(document.getElementById('snippet-field-group'));
  groups.off('change.groupDelegate');
  groups.on('change.groupDelegate', function(evt) {
    var value = parseInt($(this).val(), 10);

    groupDelegate.selectedGroupIndex(value >= 0 ? value : undefined);
  });
}

function setGroups(personalGroupNames, sharedGroupNames, organizationGroupNames, index) {
  var groupsSelect = $(document.getElementById('snippet-field-group'));
  groupsSelect.children().remove();
  var groupsRow = groupsSelect.parent().parent().parent();
  if (groupsRow.hasClass('nogroup')) {
    groupsRow.removeClass('nogroup');
    adjustEditorHeight();
  }

  if (personalGroupNames.length) {
    var personalGroups = $('<optgroup></optgroup>');
    personalGroups.prop('label', 'Personal');

    var totalIndex = 0;
    $.each(personalGroupNames, function(dummy, name) {
      var the_option = $('<option>');
      the_option.val(totalIndex);
      the_option.text(name);
      $(personalGroups).append(the_option);

      totalIndex += 1;
    });

    groupsSelect.append(personalGroups);
  }

  if (sharedGroupNames.length) {
    var sharedGroups = $('<optgroup></optgroup>');
    sharedGroups.prop('label', 'Shared');

    $.each(sharedGroupNames, function(dummy, name) {
      var the_option = $('<option>');
      the_option.val(totalIndex);
      the_option.text(name);
      sharedGroups.append(the_option);

      totalIndex += 1;
    });

    groupsSelect.append(sharedGroups);
  }

  if (organizationGroupNames.length) {
    var organizationGroups = $('<optgroup></optgroup>');
    organizationGroups.prop('label', 'Organization');

    $.each(organizationGroupNames, function(dummy, name) {
      var the_option = $('<option>');
      the_option.val(totalIndex);
      the_option.text(name);
      organizationGroups.append(the_option);

      totalIndex += 1;
    });

    groupsSelect.append(organizationGroups);
  }

  groupsSelect.val((index >= 0 && index < groupsSelect[0].options.length) ? index : -1);
  if (storedGroupDelegate) {
    var theValue = parseInt(groupsSelect.val(), 10);
    storedGroupDelegate.selectedGroupIndex(theValue >= 0 ? theValue : undefined);
  }
}

function setFocusOnEditor() {
  editor.focus();
}

function setFocusOnAbbreviation() {
  document.getElementById('snippet-field-abbreviation').focus();
}

function disableEditorFields(editorFields, disable) {
  for (var counter = 0; counter < editorFields.length; counter++) {
    field = editorFields[counter]

    if (field === 'AbbreviationCase') {
      var abbreviationCase = document.getElementById('snippet-field-abbreviation-case');
      abbreviationCase.disabled = disable;
    } else if (field === 'Abbreviation') {
      var abbreviation = document.getElementById('snippet-field-abbreviation');
      abbreviation.disabled = disable;
    } else if (field === 'Label') {
      var label = document.getElementById('snippet-field-label');
      label.disabled = disable;
    } else if (field === 'ContentType') {
      var contentType = document.getElementById('snippet-field-content-type');
      contentType.disabled = disable;
    } else if (field === 'ContentText') {
      var elements = document.getElementsByClassName('btn');
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        element.disabled = disable;
      }
      var alpha = 1.0;

      if (disable) {
        alpha = 0.4;
        editor.addEventListener('keydown', preventDefault, false);
      } else {
        editor.removeEventListener('keydown', preventDefault, false);
      }
      var editorDiv = document.getElementById('editor-container');
      editorDiv.style.opacity = alpha;
      editorDiv.contentEditable = !disable;
      var toolbar = document.getElementsByClassName('toolbar-row')[0];
      toolbar.style.opacity = alpha;
    }
  }
}

function setReadOnly(enabled) {
  $(':input').prop('disabled', enabled);
  var editorDiv = document.getElementById('editor-container');
  editorDiv.contentEditable = !enabled;
  var alpha = (enabled ? 0.4 : 1.0);
  editorDiv.style.opacity = alpha;
  var spectrumReadOnly = enabled ? "disable" : "enable";
  $("#color-picker").spectrum(spectrumReadOnly);
  var toolbar = document.getElementsByClassName('toolbar-row')[0];
  toolbar.style.opacity = alpha;
}

function setImageImportDelegate(delegate) {
  imageImportDelegate = delegate;
}

function setPreviewDelegate(delegate) {
  previewDelegate = delegate;
}

function disableImageImport() {
  var imageImportButton = document.getElementById('files-label');
  imageImportButton.remove();
  var fileImportElement = document.getElementById('file');
  fileImportElement.remove();
}

function disableSpecialCharacterDropdown() {
  var specialCharactedDropdown = document.getElementById('special-character-dropdown');
  specialCharactedDropdown.remove();
}

function insertImageHTML(imageHTML) {
  editor.insertHTML(imageHTML);
  snippetChangedBroadcast.editorContentChanged(editor);
}

function setEditorDelegate(delegate) {
  editorDelegate = delegate;
}

function setFillinDelegate(delegate) {
  fillinDelegate = delegate;
}

function setEditorLogDelegate(delegate) {
  editorLogDelegate = delegate;
}

function setTabFocusOutDelegate(delegate) {
  tabFocusOutDelegate = delegate;
}

function setSnippetLabelText(labelText) {
  var labelTextInput = document.getElementById('snippet-field-label');
  labelTextInput.value = labelText;
}

function setSnippetAbbreviationText(abbreviationText) {
  var abbreviationTextInput = document.getElementById('snippet-field-abbreviation');
  abbreviationTextInput.value = abbreviationText;
}

function setSnippetAbbreviationCase(abbreviationCaseNumber) {
  if (abbreviationCaseNumber >= 0 && abbreviationCaseNumber <= 2) {
    var abbreviationCaseSelector = document.getElementById('snippet-field-abbreviation-case');
    abbreviationCaseSelector.value = abbreviationCaseNumber;
  } else {
    console.log('abbreviation case number must be a value between 0 and 2');
  }
}

function setSnippetContentType(contentTypeNumber) {
  if (contentTypeNumber >= 0 && contentTypeNumber <= 5 && contentTypeNumber != 1) {
    var contentTypeSelector = document.getElementById('snippet-field-content-type');
    contentTypeSelector.value = contentTypeNumber;
    prepareToolbarForEditingMode(contentTypeNumber);
    basicEditorFunctions.setDefaultFontStyleForContentMode(contentTypeNumber);
  } else {
    console.log('Content type must be between 0-5 but not 1');
  }
}

function setSnippet(snippetDictionary) {
  var labelText = snippetDictionary['Label'];
  setSnippetLabelText(labelText);

  var abbreviationText = snippetDictionary['Abbreviation'];
  setSnippetAbbreviationText(abbreviationText);

  var abbreviationCaseNumber = snippetDictionary['AbbreviationCase'];
  setSnippetAbbreviationCase(abbreviationCaseNumber);

  var contentText = snippetDictionary['ContentText'];
  setSnippetContentText(contentText);

  var contentType = snippetDictionary['ContentType'];
  setSnippetContentType(contentType);
}

function getSnippet() {
  var snippetPropertyElements = document.getElementsByClassName('js-snippet-property');
  var snippet = {};

  for (var counter = 0; counter < snippetPropertyElements.length; counter++) {
    var snippetPropertyElement = snippetPropertyElements[counter];
    var snippetPropertyName = snippetPropertyElement.getAttribute('js-snippet-property-name');
    var snippetPropertyValue = snippetPropertyElement.value;

    snippet[snippetPropertyName] = snippetPropertyValue;
  }
  var snippetContents = editor.getHTML();

  if (snippetContents === '<p><br></p>') { //this is what we get back when the editor is empty.
    snippetContents = '';
  }
  snippet['ContentText'] = snippetContents;

  if (snippet['ContentType'] === '') {
    snippet = undefined;
  }

  return snippet;
}

function setSnippetContentText(contentText) {
  if (contentText != undefined) {
    editor.setHTML(contentText);
    snippetChangedBroadcast.setPreviousSnippetContent(editor.getHTML());
  }
  editor.moveCursorToEnd();
}

function setSnippetContentTextSmart(contentText) {
  // set the editor text treating argument as plain text or html depending on contentType
  if (document.getElementById('snippet-field-content-type').value == "5") {
    editor.setHTML(contentText);
    snippetChangedBroadcast.setPreviousSnippetContent(editor.getHTML());
  } else {
    // treat contentText as plain text, so convert to html format firstPart
    // this should always be first for setters .replace(/&amp;/g, "&")
    var str = "<p>" + String(contentText).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br></p><p>');
    str = str + "</p>";
    str = str.replace(/<p><\/p>$/, "<p><br></p>");
    editor.setHTML(str);
    snippetChangedBroadcast.setPreviousSnippetContent(editor.getHTML());
    editor.moveCursorToEnd();
  }
}

function setSnippetContentTextWithEscaping(contentText) {
  //this should always be first for setters .replace(/&amp;/g, "&")
  var escapedContent = String(contentText).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br />');
  editor.setHTML(escapedContent);
  snippetChangedBroadcast.setPreviousSnippetContent(editor.getHTML());
}

function getSnippetSmart() {
  var result = getSnippet();

  if (result) {
    if (result['ContentType'] != "5") {
      var str = result['ContentText'];

      // this should always be last .replace(/&amp;/g, "&")
      str = str.replace(/<br><\/p>$/, "</p>").replace(/<br>/gi, "\n").replace(/<p.*?>/gi, "").replace(/<(?:.|\s)*?>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
      result['ContentText'] = str;
    } else {
      // remove extraneous html for ending last line (always a dummy para)
      var str = result['ContentText'];
      str = str.replace(/<br><\/p>$/, "</p>").replace(/<p><\/p>$/, "");
      result['ContentText'] = str;
    }
  }
  return result;
}

function setSnippetSmart(snippetDictionary) {
  var labelText = snippetDictionary['Label'];
  setSnippetLabelText(labelText);

  var abbreviationText = snippetDictionary['Abbreviation'];
  setSnippetAbbreviationText(abbreviationText);

  var abbreviationCaseNumber = snippetDictionary['AbbreviationCase'];
  setSnippetAbbreviationCase(abbreviationCaseNumber);

  var contentType = snippetDictionary['ContentType'];
  setSnippetContentType(contentType);

  var contentText = snippetDictionary['ContentText'];
  setSnippetContentTextSmart(contentText);
}

function selectedFillin() {
  var fillinText = fillins.selectedFillin();
  return fillinText;
}

(function setup(window, document, undefined) {
  var editorContainer = document.getElementById('editor-container');
  editorContainer.style.lineHeight = 1.0;
  editor = new Squire(editorContainer, {
    blockTag: 'p',
    blockAttributes: {
      'class': 'paragraph'
    },
    tagAttributes: {
      ul: {
        'class': 'UL'
      },
      ol: {
        'class': 'OL'
      },
      li: {
        'class': 'listItem'
      }
    }
  });

  //editor event listeners
  editor.addEventListener('select', fillins.editFillin, false);
  editor.addEventListener('focus', function(event) {
    editorDelegate['editorFocus'](1);
                         });
  // Squire mediates blur / focus events, so use the editor container to detect focus-related content changes
  editorContainer.addEventListener('blur', snippetChangedBroadcast.editorContentChanged.bind(null, editor), false);
  editor.addEventListener('pathChange', toolbarButtonState.pathChanged, false);
  editor.addEventListener('keyup', toolbarButtonState.checkForArrowKeyDowns, false);
  editor.addEventListener('click', function(event) {
    if (event.target.tagName === 'A') {
      event.preventDefault();
      window.open(event.target.href, '_blank');
    }
    toolbarButtonState.pathChanged(event);
  }, false);

  editor.addEventListener('keydown', function(event) {
    var key = event.key;
    if (key === undefined) { //Different browsers use different names for this one
      key = event.keyIdentifier;
    }
    if (event.altKey && key === 'U+0009') {
      editor.insertHTML('&#09;');
      event.preventDefault();
    }
  });

  //Don't select a content type by default. It is client's job to do so.
  var contentTypeSelector = document.getElementById('snippet-field-content-type');
  contentTypeSelector.value = -1;
  setFontList(['Arial', 'Avant Garde', 'Bookman', 'Comic Sans MS', 'Courier New', 'Garamond', 'Georgia', 'Impact', 'Palatino', 'Times New Roman', 'Trebuchet MS', 'Verdana']);
  //register to listen for window resize
  window.addEventListener('resize', adjustEditorHeight, false);

  // Correct the editor height once the document loads
  $(adjustEditorHeight);

  $("#color-picker").spectrum({
    color: "#00",
    showInput: true,
    className: "full-spectrum",
    showInitial: true,
    togglePaletteOnly: true,
    showPaletteOnly: true,
    preferredFormat: "hex",
    showSelectionPalette: true,
    localStorageKey: "spectrum.editorTextColor",
    hideAfterPaletteSelect: true,
    togglePaletteMoreText: '+',
    togglePaletteLessText: '-',
    allowEmpty: true,
    move: function() {

    },
    show: function() {
      dropdownBehavior.dismissBootstrapDropdowns();
      editor.blur();
    },
    beforeShow: function() {

    },
    hide: function() {

    },
    change: function(color) {
      var thing = color.toHex();
      editor.setTextColour(color);
    },
    palette: [
      ["rgb(0, 0, 0)", "rgb(67, 67, 67)", "rgb(102, 102, 102)",
        "rgb(204, 204, 204)", "rgb(217, 217, 217)", "rgb(255, 255, 255)"
      ],
      ["rgb(152, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 153, 0)", "rgb(255, 255, 0)", "rgb(0, 255, 0)",
        "rgb(0, 255, 255)", "rgb(74, 134, 232)", "rgb(0, 0, 255)", "rgb(153, 0, 255)", "rgb(255, 0, 255)"
      ],
      ["rgb(230, 184, 175)", "rgb(244, 204, 204)", "rgb(252, 229, 205)", "rgb(255, 242, 204)", "rgb(217, 234, 211)",
        "rgb(208, 224, 227)", "rgb(201, 218, 248)", "rgb(207, 226, 243)", "rgb(217, 210, 233)", "rgb(234, 209, 220)",
        "rgb(221, 126, 107)", "rgb(234, 153, 153)", "rgb(249, 203, 156)", "rgb(255, 229, 153)", "rgb(182, 215, 168)",
        "rgb(162, 196, 201)", "rgb(164, 194, 244)", "rgb(159, 197, 232)", "rgb(180, 167, 214)", "rgb(213, 166, 189)",
        "rgb(204, 65, 37)", "rgb(224, 102, 102)", "rgb(246, 178, 107)", "rgb(255, 217, 102)", "rgb(147, 196, 125)",
        "rgb(118, 165, 175)", "rgb(109, 158, 235)", "rgb(111, 168, 220)", "rgb(142, 124, 195)", "rgb(194, 123, 160)",
        "rgb(166, 28, 0)", "rgb(204, 0, 0)", "rgb(230, 145, 56)", "rgb(241, 194, 50)", "rgb(106, 168, 79)",
        "rgb(69, 129, 142)", "rgb(60, 120, 216)", "rgb(61, 133, 198)", "rgb(103, 78, 167)", "rgb(166, 77, 121)",
        "rgb(91, 15, 0)", "rgb(102, 0, 0)", "rgb(120, 63, 4)", "rgb(127, 96, 0)", "rgb(39, 78, 19)",
        "rgb(12, 52, 61)", "rgb(28, 69, 135)", "rgb(7, 55, 99)", "rgb(32, 18, 77)", "rgb(76, 17, 48)"
      ]
    ]
  });
})(window, document);
