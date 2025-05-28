// (2025-04-29) 소스코드 출력시 컴파일 오류 유발하는 유니코드 공백문자, byte order mark 등을 빠짐없이 제거해줘.
$(function () {
    var $body = $('body');
    var $frames = $('#frames');
    var $hexInput = $('#hex-input');
    var $insertButton = $('#insert-button');
    var $deleteButton = $('#delete-button');
    var $updateButton = $('#update-button');
    var $numColsMatrix = $('#num-cols-matrix');
    var $numRowsMatrix = $('#num-rows-matrix');
    var $applyMatrixSizeButton = $('#apply-matrix-size');
    var $hexInputApplyButton = $('#hex-input-apply');

    var $outputFormatByte = $('#output-format-byte');
    var $outputFormatHex = $('#output-format-hex');

    var $leds, $colsGlobal, $rowsGlobal;

    var NUM_COLS_MATRIX = parseInt($numColsMatrix.val());
    var NUM_ROWS_MATRIX = parseInt($numRowsMatrix.val());

    var TOTAL_PIXEL_COLS = NUM_COLS_MATRIX * 8;
    var TOTAL_PIXEL_ROWS = NUM_ROWS_MATRIX * 8;

    // Helper function for mapping global (x,y) to (module_idx, module_x, module_y)
    function getModuleCoords(globalX, globalY) {
        if (globalX < 0 || globalX >= TOTAL_PIXEL_COLS || globalY < 0 || globalY >= TOTAL_PIXEL_ROWS) {
            return null; // Out of bounds
        }

        var moduleCol = Math.floor(globalX / 8);
        var moduleRow = Math.floor(globalY / 8);
        var moduleIndex = moduleRow * NUM_COLS_MATRIX + moduleCol;

        var localX = globalX % 8;
        var localY = globalY % 8;

        return {
            moduleIndex: moduleIndex,
            localX: localX,
            localY: localY
        };
    }

    var generator = {
        tableCols: function (totalCols) {
            var out = ['<table id="cols-list-global"><tr>'];
            for (var i = 1; i <= totalCols; i++) {
                out.push('<td class="item" data-col="' + i + '">' + i + '</td>');
            }
            out.push('</tr></table>');
            return out.join('');
        },
        tableRows: function (totalRows) {
            var out = ['<table id="rows-list-global">'];
            for (var i = 1; i <= totalRows; i++) {
                out.push('<tr><td class="item" data-row="' + i + '">' + i + '</td></tr>');
            }
            out.push('</table>');
            return out.join('');
        },
        tableLeds: function (totalRows, totalCols) {
            var out = ['<table id="leds-matrix">'];
            for (var i = 1; i <= totalRows; i++) {
                out.push('<tr>');
                for (var j = 1; j <= totalCols; j++) {
                    var moduleCoords = getModuleCoords(j - 1, i - 1);
                    out.push('<td class="item" data-row="' + i + '" data-col="' + j + '" data-module-idx="' + (moduleCoords ? moduleCoords.moduleIndex : '') + '"></td>');
                }
                out.push('</tr>');
            }
            out.push('</table>');
            return out.join('');
        }
    };

    var converter = {
        patternToFrame: function (fullPattern) {
            var patterns = fullPattern.split('|');
            var out = ['<div class="frame-container" data-hex="' + fullPattern + '">'];

            out.push('<table class="frame-grid">');
            for (var r = 0; r < NUM_ROWS_MATRIX; r++) {
                out.push('<tr>');
                for (var c = 0; c < NUM_COLS_MATRIX; c++) {
                    var moduleIndex = r * NUM_COLS_MATRIX + c;
                    var pattern = patterns[moduleIndex] || '0000000000000000';
                    out.push('<td class="sub-frame-cell">');
                    out.push(converter.subPatternTo8x8Frame(pattern));
                    out.push('</td>');
                }
                out.push('</tr>');
            }
            out.push('</table>');
            out.push('</div>');
            return out.join('');
        },
        subPatternTo8x8Frame: function (pattern) {
            var out = ['<table class="frame sub-frame" data-hex="' + pattern + '">'];
            for (var i = 0; i < 8; i++) { // 0-7 로우
                out.push('<tr>');
                for (var j = 0; j < 8; j++) { // 0-7 컬럼
                    var byte = parseInt(pattern.substr(j * 2, 2), 16);
                    if ((byte & (1 << i))) {
                        out.push('<td class="item active"></td>');
                    } else {
                        out.push('<td class="item"></td>');
                    }
                }
                out.push('</tr>');
            }
            out.push('</table>');
            return out.join('');
        },

        // N x M 매트릭스에 대한 중첩 배열 (예: IMAGES[프레임][모듈][8]) 출력
        patternsToCodeCppByteArray: function (allFramesPatterns) {
            var numModules = NUM_COLS_MATRIX * NUM_ROWS_MATRIX;
            var out = ['const uint8_t IMAGES[' + allFramesPatterns.length + '][' + numModules + '][8] = {\n'];

            for (var i = 0; i < allFramesPatterns.length; i++) {
                var currentFrameHex = allFramesPatterns[i];
                var modulePatterns = currentFrameHex.split('|');

                out.push('{\n'); // 각 프레임 시작
                for (var m = 0; m < numModules; m++) {
                    var pattern = modulePatterns[m] || '0000000000000000';

                    out.push('  {'); // 각 모듈 시작 (8바이트)
                    for (var j = 0; j < 8; j++) { // j는 컬럼 인덱스 (0-7)
                        var hexByteStr = pattern.substr(j * 2, 2);
                        var byteVal = parseInt(hexByteStr, 16);

                        var binaryString = '0b' + ('00000000' + byteVal.toString(2)).slice(-8);
                        out.push(binaryString);
                        if (j < 7) {
                            out.push(', ');
                        }
                    }
                    out.push('}'); // 각 모듈 끝
                    if (m < numModules - 1) {
                        out.push(',\n');
                    } else {
                        out.push('\n');
                    }
                }
                out.push('}'); // 각 프레임 끝
                if (i < allFramesPatterns.length - 1) {
                    out.push(',\n');
                } else {
                    out.push('\n');
                }
            }
            out.push('};\n');
            out.push('const int IMAGES_LEN = sizeof(IMAGES)/sizeof(IMAGES[0]);\n');
            out.push('const int NUM_COLS_MATRIX = ' + NUM_COLS_MATRIX + ';\n');
            out.push('const int NUM_ROWS_MATRIX = ' + NUM_ROWS_MATRIX + ';\n');
            return out.join('');
        },

        patternsToCodeCppHexArray: function (allFramesPatterns) {
            var out = ['const char* IMAGES_HEX[' + allFramesPatterns.length + '] = {\n'];
            for (var i = 0; i < allFramesPatterns.length; i++) {
                var currentFrameHex = allFramesPatterns[i];
                out.push('  "' + currentFrameHex.toUpperCase() + '"');
                if (i < allFramesPatterns.length - 1) {
                    out.push(',\n');
                } else {
                    out.push('\n');
                }
            }
            out.push('};\n');
            out.push('const int IMAGES_LEN = sizeof(IMAGES_HEX)/sizeof(IMAGES_HEX[0]);\n');
            out.push('const int NUM_COLS_MATRIX = ' + NUM_COLS_MATRIX + ';\n');
            out.push('const int NUM_ROWS_MATRIX = ' + NUM_ROWS_MATRIX + ';\n');
            return out.join('');
        },

        patternsToCodeJSByteArray: function (allFramesPatterns) {
            var numModules = NUM_COLS_MATRIX * NUM_ROWS_MATRIX;
            var out = ['var pictures = [\n'];

            for (var i = 0; i < allFramesPatterns.length; i++) {
                var currentFrameHex = allFramesPatterns[i];
                var modulePatterns = currentFrameHex.split('|');

                out.push('  ['); // 각 프레임 시작
                for (var m = 0; m < numModules; m++) {
                    var pattern = modulePatterns[m] || '0000000000000000';
                    out.push('['); // 각 모듈 시작 (8바이트)
                    for (var j = 0; j < 8; j++) {
                        var byteStr = pattern.substr(j * 2, 2);
                        var byteVal = parseInt(byteStr, 16);
                        out.push('0x' + ('00' + byteVal.toString(16)).slice(-2).toUpperCase());
                        if (j < 7) {
                            out.push(', ');
                        }
                    }
                    out.push(']'); // 각 모듈 끝
                    if (m < numModules - 1) {
                        out.push(', ');
                    }
                }
                out.push(']'); // 각 프레임 끝
                if (i < allFramesPatterns.length - 1) {
                    out.push(',\n');
                } else {
                    out.push('\n');
                }
            }
            out.push('];\n');
            out.push('var NUM_COLS_MATRIX = ' + NUM_COLS_MATRIX + ';\n');
            out.push('var NUM_ROWS_MATRIX = ' + NUM_ROWS_MATRIX + ';\n');
            return out.join('');
        },

        patternsToCodeJSHexArray: function (allFramesPatterns) {
            var out = ['var pictures = [\n'];
            for (var i = 0; i < allFramesPatterns.length; i++) {
                var currentFrameHex = allFramesPatterns[i];
                out.push('  "' + currentFrameHex.toUpperCase() + '"');
                if (i < allFramesPatterns.length - 1) {
                    out.push(',\n');
                } else {
                    out.push('\n');
                }
            }
            out.push('];\n');
            out.push('var NUM_COLS_MATRIX = ' + NUM_COLS_MATRIX + ';\n');
            out.push('var NUM_ROWS_MATRIX = ' + NUM_ROWS_MATRIX + ';\n');
            return out.join('');
        },

        fixPattern: function (pattern) {
            var numModules = NUM_COLS_MATRIX * NUM_ROWS_MATRIX;
            pattern = pattern.replace(/[^0-9a-fA-F|]/g, '');

            var parts = pattern.split('|');
            var fixedParts = [];
            for (var i = 0; i < numModules; i++) {
                var p = parts[i] || '';
                p = p.replace(/[^0-9a-fA-F]/g, '');
                fixedParts.push(('0000000000000000' + p).substr(-16));
            }
            return fixedParts.join('|');
        }
    };

    function makeFrameElement(fullPattern) {
        fullPattern = converter.fixPattern(fullPattern);
        var $frame = $(converter.patternToFrame(fullPattern));
        $frame.click(onFrameClick);
        return $frame;
    }

    function ledsToHex() {
        var numModules = NUM_COLS_MATRIX * NUM_ROWS_MATRIX;
        var moduleHexPatterns = Array(numModules).fill('0000000000000000');

        for (var r = 0; r < TOTAL_PIXEL_ROWS; r++) {
            for (var c = 0; c < TOTAL_PIXEL_COLS; c++) {
                var $led = $leds.find('.item[data-row=' + (r + 1) + '][data-col=' + (c + 1) + ']');
                if ($led.hasClass('active')) {
                    var moduleCoords = getModuleCoords(c, r);
                    if (moduleCoords) {
                        var moduleIndex = moduleCoords.moduleIndex;
                        var localX = moduleCoords.localX;
                        var localY = moduleCoords.localY;

                        var currentModulePattern = moduleHexPatterns[moduleIndex];
                        var byteCharIndex = localX * 2;
                        
                        var currentByte = parseInt(currentModulePattern.substr(byteCharIndex, 2), 16);
                        
                        currentByte |= (1 << localY);

                        moduleHexPatterns[moduleIndex] = currentModulePattern.substr(0, byteCharIndex) +
                                                          ('00' + currentByte.toString(16)).slice(-2).toUpperCase() +
                                                          currentModulePattern.substr(byteCharIndex + 2);
                    }
                }
            }
        }
        $hexInput.val(moduleHexPatterns.join('|'));
        return moduleHexPatterns.join('|');
    }

    function hexInputToLeds() {
        $leds.find('.item').removeClass('active');

        var fullPattern = getInputHexValue();
        var modulePatterns = fullPattern.split('|');

        for (var m = 0; m < modulePatterns.length; m++) {
            var modulePattern = modulePatterns[m];
            if (!modulePattern) continue;

            var moduleRow = Math.floor(m / NUM_COLS_MATRIX);
            var moduleCol = m % NUM_COLS_MATRIX;
            var startGlobalX = moduleCol * 8;
            var startGlobalY = moduleRow * 8;

            for (var i = 0; i < 8; i++) { // i는 local column index (0-7)
                var byte = parseInt(modulePattern.substr(i * 2, 2), 16);
                
                for (var j = 0; j < 8; j++) { // j는 local row index (0-7)
                    if ((byte & (1 << j))) {
                        var globalX = startGlobalX + i;
                        var globalY = startGlobalY + j;
                        $leds.find('.item[data-row=' + (globalY + 1) + '][data-col=' + (globalX + 1) + ']').addClass('active');
                    }
                }
            }
        }
    }

    var savedHashState;

    function printCode(patterns) {
        if (patterns.length) {
            var code;
            var outputLanguage = $('input[name="output_lang"]:checked').val();
            var outputFormatType = $('input[name="output_format_type"]:checked').val();

            if (outputLanguage === "arduino") {
                if (outputFormatType === "byte") {
                    code = converter.patternsToCodeCppByteArray(patterns);
                } else {
                    code = converter.patternsToCodeCppHexArray(patterns);
                }
            } else if (outputLanguage === "javascript") {
                if (outputFormatType === "byte") {
                    code = converter.patternsToCodeJSByteArray(patterns);
                } else {
                    code = converter.patternsToCodeJSHexArray(patterns);
                }
            }
            // 유니코드 공백문자 및 BOM 제거
            if (code) {
                code = code.replace(/[\u0000-\u001F\u007F-\u009F\uFEFF]/g, '');
                code = code.replace(/\0/g, '');
                code = code.replace(/,\s*([\u200B\u200C\u200D\u2060\uFEFF])+/g, ',');
            }
            $('#output').val(code);
            hljs.highlightElement($('#output')[0]);
        } else {
            $('#output').val('');
            hljs.highlightElement($('#output')[0]);
        }
    }

    function framesToPatterns() {
        var out = [];
        $frames.find('.frame-container').each(function () {
            out.push($(this).attr('data-hex'));
        });
        return out;
    }

    function saveState() {
        var patterns = framesToPatterns();
        printCode(patterns);
        window.location.hash = savedHashState = patterns.join(';');
    }

    function loadState() {
        savedHashState = window.location.hash.slice(1);
        $frames.empty();
        var frame;
        var patterns = savedHashState.split(';');

        if (patterns.length === 1 && patterns[0] === '') {
            patterns = [];
        }

        if (patterns.length === 0) {
            insertNewEmptyFrame();
            var $firstFrame = $frames.find('.frame-container').first();
            processToSave($firstFrame);
            hexInputToLeds();
            return;
        }

        for (var i = 0; i < patterns.length; i++) {
            frame = makeFrameElement(patterns[i]);
            $frames.append(frame);
        }
        var $firstFrame = $frames.find('.frame-container').first();
        if ($firstFrame.length) {
            processToSave($firstFrame);
            hexInputToLeds();
        }
    }

    function getInputHexValue() {
        return converter.fixPattern($hexInput.val());
    }

    // 애니메이션 프레임 클릭 이벤트 핸들러
    function onFrameClick() {
        var $clickedFrameContainer = $(this);
        $hexInput.val($clickedFrameContainer.attr('data-hex'));
        processToSave($clickedFrameContainer);
        hexInputToLeds();
    }

    function processToSave($focusToFrame) {
        $frames.find('.frame-container.selected').removeClass('selected');

        if ($focusToFrame.length) {
            $focusToFrame.addClass('selected');
            $deleteButton.removeAttr('disabled');
            $updateButton.removeAttr('disabled');
            $hexInput.val($focusToFrame.attr('data-hex'));
        } else {
            $deleteButton.attr('disabled', 'disabled');
            $updateButton.attr('disabled', 'disabled');
            $hexInput.val('');
        }
        saveState();
    }

    function drawMatrixUI() {
        TOTAL_PIXEL_COLS = NUM_COLS_MATRIX * 8;
        TOTAL_PIXEL_ROWS = NUM_ROWS_MATRIX * 8;

        $('#cols-container-global').empty().append($(generator.tableCols(TOTAL_PIXEL_COLS)));
        $('#rows-container-global').empty().append($(generator.tableRows(TOTAL_PIXEL_ROWS)));
        $('#leds-container').empty().append($(generator.tableLeds(TOTAL_PIXEL_ROWS, TOTAL_PIXEL_COLS)));

        $colsGlobal = $('#cols-list-global');
        $rowsGlobal = $('#rows-list-global');
        $leds = $('#leds-matrix');

        $colsGlobal.on('mousedown', '.item', function () {
            var col = parseInt($(this).attr('data-col'));
            var allActiveInCol = true;
            for (var r = 1; r <= TOTAL_PIXEL_ROWS; r++) {
                if (!$leds.find('.item[data-row=' + r + '][data-col=' + col + ']').hasClass('active')) {
                    allActiveInCol = false;
                    break;
                }
            }
            $leds.find('.item[data-col=' + col + ']').toggleClass('active', !allActiveInCol);
            ledsToHex();
            saveState();
        });

        $rowsGlobal.on('mousedown', '.item', function () {
            var row = parseInt($(this).attr('data-row'));
            var allActiveInRow = true;
            for (var c = 1; c <= TOTAL_PIXEL_COLS; c++) {
                if (!$leds.find('.item[data-row=' + row + '][data-col=' + c + ']').hasClass('active')) {
                    allActiveInRow = false;
                    break;
                }
            }
            $leds.find('.item[data-row=' + row + ']').toggleClass('active', !allActiveInRow);
            ledsToHex();
            saveState();
        });

        $leds.on('mousedown', '.item', function () {
            $(this).toggleClass('active');
            ledsToHex();
            saveState();
        });

        hexInputToLeds();
    }

    $numColsMatrix.on('change', function () {
        NUM_COLS_MATRIX = parseInt($(this).val());
    });
    $numRowsMatrix.on('change', function () {
        NUM_ROWS_MATRIX = parseInt($(this).val());
    });

    $applyMatrixSizeButton.click(function () {
        drawMatrixUI();
        var $selectedFrame = $frames.find('.frame-container.selected').first();
        if ($selectedFrame.length) {
            var currentHex = $selectedFrame.attr('data-hex');
            var newPaddedHex = converter.fixPattern(currentHex);
            $hexInput.val(newPaddedHex);
            hexInputToLeds();
            $selectedFrame.attr('data-hex', newPaddedHex);
            
            var $updatedFrameElement = makeFrameElement(newPaddedHex);
            $selectedFrame.replaceWith($updatedFrameElement);
            
            processToSave($updatedFrameElement);
        } else {
            var $newFrame = insertNewEmptyFrame();
            processToSave($newFrame);
            hexInputToLeds();
        }
        saveState();
    });

    $hexInputApplyButton.click(function () {
        var newHexValue = getInputHexValue();
        $hexInput.val(newHexValue);
        hexInputToLeds();
        var $selectedFrame = $frames.find('.frame-container.selected').first();
        if ($selectedFrame.length) {
            $selectedFrame.attr('data-hex', newHexValue);
            var $updatedFrameElement = makeFrameElement(newHexValue);
            $selectedFrame.replaceWith($updatedFrameElement);
            
            processToSave($updatedFrameElement);
        }
        saveState();
    });

    function insertNewEmptyFrame() {
        var numModules = NUM_COLS_MATRIX * NUM_ROWS_MATRIX;
        var emptyPattern = Array(numModules).fill('0000000000000000').join('|');
        var $newFrame = makeFrameElement(emptyPattern);
        $frames.append($newFrame);
        return $newFrame;
    }

    $('#invert-button').click(function () {
        $leds.find('.item').toggleClass('active');
        ledsToHex();
        saveState();
    });

    $('#shift-up-button').click(function () {
        var currentFullPattern = getInputHexValue();
        var modulePatterns = currentFullPattern.split('|');
        var newModulePatterns = Array(modulePatterns.length).fill('');

        for (var m = 0; m < modulePatterns.length; m++) {
            var pattern = modulePatterns[m];
            var bytes = [];
            for (var j = 0; j < 8; j++) {
                bytes.push(parseInt(pattern.substr(j * 2, 2), 16));
            }

            var newBytes = Array(8).fill(0);
            for (var b = 0; b < 8; b++) {
                newBytes[b] = (bytes[b] << 1) & 0xFF;
            }
            newModulePatterns[m] = newBytes.map(b => ('00' + b.toString(16)).substr(-2).toUpperCase()).join('');
        }
        $hexInput.val(newModulePatterns.join('|'));
        hexInputToLeds();
        saveState();
    });

    $('#shift-down-button').click(function () {
        var currentFullPattern = getInputHexValue();
        var modulePatterns = currentFullPattern.split('|');
        var newModulePatterns = Array(modulePatterns.length).fill('');

        for (var m = 0; m < modulePatterns.length; m++) {
            var pattern = modulePatterns[m];
            var bytes = [];
            for (var j = 0; j < 8; j++) {
                bytes.push(parseInt(pattern.substr(j * 2, 2), 16));
            }

            var newBytes = Array(8).fill(0);
            for (var b = 0; b < 8; b++) {
                newBytes[b] = bytes[b] >> 1;
            }
            newModulePatterns[m] = newBytes.map(b => ('00' + b.toString(16)).substr(-2).toUpperCase()).join('');
        }
        $hexInput.val(newModulePatterns.join('|'));
        hexInputToLeds();
        saveState();
    });

    $('#shift-right-button').click(function () {
        var currentFullPattern = getInputHexValue();
        var modulePatterns = currentFullPattern.split('|');
        var newModulePatterns = Array(modulePatterns.length).fill('');

        for (var m = 0; m < modulePatterns.length; m++) {
            var pattern = modulePatterns[m];
            
            var currentModuleLeds = [];
            for (var c = 0; c < 8; c++) {
                var byte = parseInt(pattern.substr(c * 2, 2), 16);
                currentModuleLeds[c] = [];
                for (var r = 0; r < 8; r++) {
                    currentModuleLeds[c][r] = !!(byte & (1 << r));
                }
            }

            var shiftedLeds = [];
            for (var c = 0; c < 8; c++) {
                shiftedLeds[c] = [];
                for (var r = 0; r < 8; r++) {
                    if (c === 0) {
                        shiftedLeds[c][r] = false;
                    } else {
                        shiftedLeds[c][r] = currentModuleLeds[c - 1][r];
                    }
                }
            }

            var out = [];
            for (var c = 0; c < 8; c++) {
                var newByte = 0;
                for (var r = 0; r < 8; r++) {
                    if (shiftedLeds[c][r]) {
                        newByte |= (1 << r);
                    }
                }
                out.push(('00' + newByte.toString(16)).substr(-2).toUpperCase());
            }
            newModulePatterns[m] = out.join('');
        }
        $hexInput.val(newModulePatterns.join('|'));
        hexInputToLeds();
        saveState();
    });

    $('#shift-left-button').click(function () {
        var currentFullPattern = getInputHexValue();
        var modulePatterns = currentFullPattern.split('|');
        var newModulePatterns = Array(modulePatterns.length).fill('');

        for (var m = 0; m < modulePatterns.length; m++) {
            var pattern = modulePatterns[m];
            
            var currentModuleLeds = [];
            for (var c = 0; c < 8; c++) {
                var byte = parseInt(pattern.substr(c * 2, 2), 16);
                currentModuleLeds[c] = [];
                for (var r = 0; r < 8; r++) {
                    currentModuleLeds[c][r] = !!(byte & (1 << r));
                }
            }

            var shiftedLeds = [];
            for (var c = 0; c < 8; c++) {
                shiftedLeds[c] = [];
                for (var r = 0; r < 8; r++) {
                    if (c === 7) {
                        shiftedLeds[c][r] = false;
                    } else {
                        shiftedLeds[c][r] = currentModuleLeds[c + 1][r];
                    }
                }
            }

            var out = [];
            for (var c = 0; c < 8; c++) {
                var newByte = 0;
                for (var r = 0; r < 8; r++) {
                    if (shiftedLeds[c][r]) {
                        newByte |= (1 << r);
                    }
                }
                out.push(('00' + newByte.toString(16)).substr(-2).toUpperCase());
            }
            newModulePatterns[m] = out.join('');
        }
        $hexInput.val(newModulePatterns.join('|'));
        hexInputToLeds();
        saveState();
    });

    $hexInput.keyup(function (event) {
        if (event.keyCode === 13) {
            $hexInputApplyButton.click();
        }
    });

    $deleteButton.click(function () {
        var $selectedFrame = $frames.find('.frame-container.selected').first();
        var $nextFrame = $selectedFrame.next('.frame-container').first();

        if (!$nextFrame.length) {
            $nextFrame = $selectedFrame.prev('.frame-container').first();
        }

        $selectedFrame.remove();

        if (!$frames.find('.frame-container').length) {
            insertNewEmptyFrame();
            $nextFrame = $frames.find('.frame-container').first();
        }

        processToSave($nextFrame);
        hexInputToLeds();
    });

    $insertButton.click(function () {
        var $newFrame = makeFrameElement(getInputHexValue());
        var $selectedFrame = $frames.find('.frame-container.selected').first();

        if ($selectedFrame.length) {
            $selectedFrame.after($newFrame);
        } else {
            $frames.append($newFrame);
        }

        processToSave($newFrame);
    });

    $updateButton.click(function () {
        var $selectedFrame = $frames.find('.frame-container.selected').first();
        if ($selectedFrame.length) {
            var currentHex = ledsToHex();
            
            $selectedFrame.attr('data-hex', currentHex);
            var $updatedFrameElement = makeFrameElement(currentHex);
            $selectedFrame.replaceWith($updatedFrameElement);
            
            processToSave($updatedFrameElement);
        }
    });

    // 출력 언어 라디오 버튼 변경 시
    $('input[name="output_lang"]').change(function () {
        var patterns = framesToPatterns();
        printCode(patterns);
    });

    // 출력 형식 라디오 버튼 변경 시
    $('input[name="output_format_type"]').change(function () {
        var patterns = framesToPatterns();
        printCode(patterns);
    });

    $('#matrix-toggle').hover(function () {
        $colsGlobal.find('.item').addClass('hover');
        $rowsGlobal.find('.item').addClass('hover');
    }, function () {
        $colsGlobal.find('.item').removeClass('hover');
        $rowsGlobal.find('.item').removeClass('hover');
    });

    $('#matrix-toggle').mousedown(function () {
        var totalLeds = TOTAL_PIXEL_COLS * TOTAL_PIXEL_ROWS;
        $leds.find('.item').toggleClass('active', $leds.find('.item.active').length !== totalLeds);
        ledsToHex();
        saveState();
    });

    $('#circuit-theme').click(function () {
        if ($body.hasClass('circuit-theme')) {
            $body.removeClass('circuit-theme');
        } else {
            $body.addClass('circuit-theme');
        }
    });

    $('.leds-case').click(function () {
        var themeName = $(this).attr('data-leds-theme');
        setLedsTheme(themeName);
    });

    function setLedsTheme(themeName) {
        $body.removeClass('red-leds yellow-leds green-leds blue-leds white-leds').addClass(themeName);
    }

    // function setPageTheme(themeName) {
    //     $body.removeClass('plain-theme circuit-theme').addClass(themeName);
    // }

    var playInterval;

    $('#play-button').click(function () {
        if (playInterval) {
            $('#play-button-stop').hide();
            $('#play-button-play').show();
            clearInterval(playInterval);
            playInterval = null;
        } else {
            $('#play-button-stop').show();
            $('#play-button-play').hide();

            var $allFrames = $frames.find('.frame-container');
            if ($allFrames.length === 0) {
                $('#play-button-stop').hide();
                $('#play-button-play').show();
                return;
            }

            var $selectedFrame = $frames.find('.frame-container.selected').first();
            var currentIndex = $allFrames.index($selectedFrame);
            if (currentIndex === -1) {
                currentIndex = 0;
            }
            
            var nextPlayIndex = currentIndex;

            playInterval = setInterval(function () {
                var $nextFrame = $allFrames.eq(nextPlayIndex);

                if ($nextFrame.length) {
                    $hexInput.val($nextFrame.attr('data-hex'));
                    processToSave($nextFrame);
                    hexInputToLeds();
                }

                nextPlayIndex = (nextPlayIndex + 1) % $allFrames.length;
            }, $('#play-delay-input').val());
        }
    });

    $(window).on('hashchange', function () {
        if (window.location.hash.slice(1) !== savedHashState) {
            loadState();
        }
    });

    $frames.sortable({
        items: '.frame-container',
        stop: function (event, ui) {
            saveState();
        }
    });

    // 초기화 함수
    function initialize() {
        NUM_COLS_MATRIX = parseInt($numColsMatrix.val());
        NUM_ROWS_MATRIX = parseInt($numRowsMatrix.val());

        drawMatrixUI();
        loadState();

        // 페이지 테마 로드
        // var pageTheme = Cookies.get('page-theme') || 'circuit-theme';
        // setPageTheme(pageTheme);
    }

    initialize();

});
