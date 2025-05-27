// scripts.js (수정된 버전)

$(function () {
    var $body = $('body');
    var $frames = $('#frames');
    var $hexInput = $('#hex-input');
    var $insertButton = $('#insert-button');
    var $deleteButton = $('#delete-button');
    var $updateButton = $('#update-button');
    var $numColsMatrix = $('#num-cols-matrix'); // N 입력 필드
    var $numRowsMatrix = $('#num-rows-matrix'); // M 입력 필드
    var $applyMatrixSizeButton = $('#apply-matrix-size'); // Apply 버튼
    var $hexInputApplyButton = $('#hex-input-apply'); // HEX 입력 Apply 버튼

    var $outputFormatByte = $('#output-format-byte'); // Byte Array 라디오 버튼
    var $outputFormatHex = $('#output-format-hex');   // Hex String Array 라디오 버튼


    var $leds, $colsGlobal, $rowsGlobal; // 전역 컬럼/로우 헤더 참조

    // N, M 값 (기본값 2x2 매트릭스)
    var NUM_COLS_MATRIX = parseInt($numColsMatrix.val()); // N
    var NUM_ROWS_MATRIX = parseInt($numRowsMatrix.val()); // M

    // 매트릭스 전체의 픽셀 너비/높이
    var TOTAL_PIXEL_COLS = NUM_COLS_MATRIX * 8;
    var TOTAL_PIXEL_ROWS = NUM_ROWS_MATRIX * 8;

    // helper function for mapping global (x,y) to (module_idx, module_x, module_y)
    function getModuleCoords(globalX, globalY) {
        if (globalX < 0 || globalX >= TOTAL_PIXEL_COLS || globalY < 0 || globalY >= TOTAL_PIXEL_ROWS) {
            return null; // 범위를 벗어남
        }

        var moduleCol = Math.floor(globalX / 8); // 모듈의 가로 위치 (0 to N-1)
        var moduleRow = Math.floor(globalY / 8); // 모듈의 세로 위치 (0 to M-1)

        // 캐스케이드 순서에 따라 모듈 주소 계산.
        // 예를 들어, 왼쪽에서 오른쪽, 위에서 아래로 순서대로 연결된 경우:
        // 0  1  2 ... N-1
        // N N+1 ... 2N-1
        // ...
        // (M-1)N ... MN-1
        var moduleIndex = moduleRow * NUM_COLS_MATRIX + moduleCol;

        var localX = globalX % 8; // 모듈 내의 X 좌표 (0-7)
        var localY = globalY % 8; // 모듈 내의 Y 좌표 (0-7)

        return {
            moduleIndex: moduleIndex,
            localX: localX,
            localY: localY
        };
    }

    var generator = {
        // 전역 컬럼 헤더 생성
        tableCols: function (totalCols) {
            var out = ['<table id="cols-list-global"><tr>'];
            for (var i = 1; i <= totalCols; i++) {
                out.push('<td class="item" data-col="' + i + '">' + i + '</td>');
            }
            out.push('</tr></table>');
            return out.join('');
        },
        // 전역 로우 헤더 생성
        tableRows: function (totalRows) {
            var out = ['<table id="rows-list-global">'];
            for (var i = 1; i <= totalRows; i++) {
                out.push('<tr><td class="item" data-row="' + i + '">' + i + '</td></tr>');
            }
            out.push('</table>');
            return out.join('');
        },
        // 전체 LED 매트릭스 생성
        tableLeds: function (totalRows, totalCols) {
            var out = ['<table id="leds-matrix">'];
            for (var i = 1; i <= totalRows; i++) {
                out.push('<tr>');
                for (var j = 1; j <= totalCols; j++) {
                    // 각 셀에 어떤 모듈에 속하는지 나타내는 속성 추가 (디버깅용)
                    var moduleCoords = getModuleCoords(j-1, i-1);
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
        subPatternTo8x8Frame: function(pattern) {
            var out = ['<table class="frame sub-frame" data-hex="' + pattern + '">'];
            for (var i = 1; i < 9; i++) {
                var byte = pattern.substr(-2 * i, 2); // 하위 바이트부터 읽기 (컬럼 0-7)
                byte = parseInt(byte, 16);

                out.push('<tr>');
                for (var j = 0; j < 8; j++) {
                    if ((byte & (1 << j))) { // LSB first
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

        // ---------- 새로운 코드 출력 형식 추가 ----------

        // N*M 매트릭스 프레임 패턴을 Byte Array 형식의 C++ 코드로 변환
        patternsToCodeCppByteArray: function (allFramesPatterns) {
            var numModules = NUM_COLS_MATRIX * NUM_ROWS_MATRIX;
            var out = ['const byte IMAGES[' + allFramesPatterns.length + '][' + (numModules * 8) + '] = {\n'];

            for (var i = 0; i < allFramesPatterns.length; i++) {
                var currentFrameHex = allFramesPatterns[i];
                var modulePatterns = currentFrameHex.split('|');

                out.push('  {');
                for (var m = 0; m < numModules; m++) {
                    var pattern = modulePatterns[m] || '0000000000000000';
                    // 각 8x8 패턴의 바이트를 역순으로 (컬럼 0-7)
                    for (var j = 7; j >= 0; j--) {
                        var byteVal = parseInt(pattern.substr(2 * j, 2), 16);
                        out.push('0x' + ('00' + byteVal.toString(16)).slice(-2).toUpperCase());
                        if (!(m === numModules - 1 && j === 0)) { // 마지막 바이트가 아니면 콤마
                            out.push(', ');
                        }
                    }
                    if (m < numModules - 1) { // 마지막 모듈이 아니면 공백 추가 (가독성)
                        out.push(' ');
                    }
                }
                out.push('}');
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

        // N*M 매트릭스 프레임 패턴을 Hex String Array 형식의 C++ 코드로 변환
        patternsToCodeCppHexArray: function (allFramesPatterns) {
            var out = ['const char* IMAGES_HEX[' + allFramesPatterns.length + '] = {\n'];
            for (var i = 0; i < allFramesPatterns.length; i++) {
                var currentFrameHex = allFramesPatterns[i];
                // 각 모듈의 16진수 문자열을 콤마 없이 연결된 형태로 저장 (예: "7E1818181C181800|..." 이 하나의 문자열)
                // 이를 Arduino에서 파싱하여 사용해야 합니다.
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

        // N*M 매트릭스 프레임 패턴을 Byte Array 형식의 JavaScript 코드로 변환
        patternsToCodeJSByteArray: function (allFramesPatterns) {
            var numModules = NUM_COLS_MATRIX * NUM_ROWS_MATRIX;
            var out = ['var pictures = [\n'];

            for (var i = 0; i < allFramesPatterns.length; i++) {
                var currentFrameHex = allFramesPatterns[i];
                var modulePatterns = currentFrameHex.split('|');

                out.push('  [');
                for (var m = 0; m < numModules; m++) {
                    var pattern = modulePatterns[m] || '0000000000000000';
                    for (var j = 7; j >= 0; j--) {
                        var byteVal = parseInt(pattern.substr(2 * j, 2), 16);
                        out.push('0x' + ('00' + byteVal.toString(16)).slice(-2).toUpperCase());
                        if (!(m === numModules - 1 && j === 0)) {
                            out.push(', ');
                        }
                    }
                    if (m < numModules - 1) {
                        out.push(' ');
                    }
                }
                out.push(']');
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

        // N*M 매트릭스 프레임 패턴을 Hex String Array 형식의 JavaScript 코드로 변환
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
        // ---------- 새로운 코드 출력 형식 추가 끝 ----------


        fixPattern: function (pattern) {
            var numModules = NUM_COLS_MATRIX * NUM_ROWS_MATRIX;
            // 16진수만 남김
            pattern = pattern.replace(/[^0-9a-fA-F|]/g, ''); // | 도 허용하여 모듈 구분자 유지

            // 패턴을 모듈별로 분리하고 각 모듈 패턴을 고정
            // '|'로 먼저 분리하고 각 부분을 16자리로 고정
            var parts = pattern.split('|');
            var fixedParts = [];
            for(var i = 0; i < numModules; i++) {
                var p = parts[i] || '';
                p = p.replace(/[^0-9a-fA-F]/g, ''); // 각 부분에서 16진수만
                fixedParts.push(('0000000000000000' + p).substr(-16));
            }
            return fixedParts.join('|'); // '|'로 구분된 문자열 반환
        },
        fixPatterns: function (patterns) {
            for (var i = 0; i < patterns.length; i++) {
                patterns[i] = converter.fixPattern(patterns[i]);
            }
            return patterns;
        }
    };

    function makeFrameElement(fullPattern) {
        fullPattern = converter.fixPattern(fullPattern);
        return $(converter.patternToFrame(fullPattern)).click(onFrameClick);
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
                        var bytes = [];
                        for (var i = 0; i < 8; i++) {
                            bytes.push(currentModulePattern.substr(i * 2, 2));
                        }

                        var colByteIndex = 7 - localX; // 기존 코드와 동일하게 바이트 순서 뒤집기 (컬럼 0-7)
                        var currentByte = parseInt(bytes[colByteIndex], 16);
                        currentByte |= (1 << localY);

                        bytes[colByteIndex] = ('00' + currentByte.toString(16)).substr(-2).toUpperCase();
                        moduleHexPatterns[moduleIndex] = bytes.join('');
                    }
                }
            }
        }
        $hexInput.val(moduleHexPatterns.join('|'));
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

            for (var i = 0; i < 8; i++) {
                var byte = modulePattern.substr(-2 * (i + 1), 2); // 하위 바이트부터 읽기
                byte = parseInt(byte, 16);

                for (var j = 0; j < 8; j++) {
                    var active = !!(byte & (1 << j));
                    if (active) {
                        var globalX = startGlobalX + j;
                        var globalY = startGlobalY + i;
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
                } else { // hex
                    code = converter.patternsToCodeCppHexArray(patterns);
                }
            } else if (outputLanguage === "javascript") {
                if (outputFormatType === "byte") {
                    code = converter.patternsToCodeJSByteArray(patterns);
                } else { // hex
                    code = converter.patternsToCodeJSHexArray(patterns);
                }
            }
            $('#output').val(code);
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
        printCode(patterns); // printArduinoCode 대신 printCode 호출
        window.location.hash = savedHashState = patterns.join(';');
    }

    function loadState() {
        savedHashState = window.location.hash.slice(1);
        $frames.empty();
        var frame;
        var patterns = savedHashState.split(';');
        if (patterns.length === 1 && patterns[0] === '') {
            patterns = [];
            insertNewEmptyFrame();
            processToSave($frames.find('.frame-container').first());
            return;
        }

        patterns = converter.fixPatterns(patterns);

        for (var i = 0; i < patterns.length; i++) {
            frame = makeFrameElement(patterns[i]);
            $frames.append(frame);
        }
        var $firstFrame = $frames.find('.frame-container').first();
        if ($firstFrame.length) {
            $firstFrame.addClass('selected');
            $hexInput.val($firstFrame.attr('data-hex'));
        } else {
            insertNewEmptyFrame();
            $firstFrame = $frames.find('.frame-container').first();
            $firstFrame.addClass('selected');
            $hexInput.val($firstFrame.attr('data-hex'));
        }


        printCode(patterns); // printArduinoCode 대신 printCode 호출
        hexInputToLeds();
        processToSave($firstFrame);
    }

    function getInputHexValue() {
        return converter.fixPattern($hexInput.val());
    }

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
        } else {
            $deleteButton.attr('disabled', 'disabled');
            $updateButton.attr('disabled', 'disabled');
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

        $colsGlobal.find('.item').off('mousedown').mousedown(function () {
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
        });

        $rowsGlobal.find('.item').off('mousedown').mousedown(function () {
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
        });

        $leds.find('.item').off('mousedown').mousedown(function () {
            $(this).toggleClass('active');
            ledsToHex();
        });

        hexInputToLeds();
        saveState();
    }

    $numColsMatrix.on('change', function() {
        NUM_COLS_MATRIX = parseInt($(this).val());
    });
    $numRowsMatrix.on('change', function() {
        NUM_ROWS_MATRIX = parseInt($(this).val());
    });

    $applyMatrixSizeButton.click(function() {
        drawMatrixUI();
    });

    $hexInputApplyButton.click(function() {
        hexInputToLeds();
        var $selectedFrame = $frames.find('.frame-container.selected').first();
        if ($selectedFrame.length) {
            $selectedFrame.attr('data-hex', getInputHexValue());
            $selectedFrame.replaceWith(makeFrameElement(getInputHexValue()));
            processToSave(makeFrameElement(getInputHexValue()));
        }
    });

    function insertNewEmptyFrame() {
        var numModules = NUM_COLS_MATRIX * NUM_ROWS_MATRIX;
        var emptyPattern = Array(numModules).fill('0000000000000000').join('|');
        var $newFrame = makeFrameElement(emptyPattern);
        $frames.append($newFrame);
        return $newFrame;
    }


    $('#invert-button').off('click').click(function () {
        $leds.find('.item').toggleClass('active');
        ledsToHex();
    });

    $('#shift-up-button').off('click').click(function () {
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
    });

    $('#shift-down-button').off('click').click(function () {
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
    });


    $('#shift-right-button').off('click').click(function () {
        var currentFullPattern = getInputHexValue();
        var modulePatterns = currentFullPattern.split('|');
        var newModulePatterns = Array(modulePatterns.length).fill('');

        for (var m = 0; m < modulePatterns.length; m++) {
            var pattern = modulePatterns[m];
            var out = [];
            for (var i = 0; i < 8; i++) {
                var byte = parseInt(pattern.substr(i * 2, 2), 16);
                byte <<= 1;
                byte &= 0xFF;
                out.push(('00' + byte.toString(16)).substr(-2).toUpperCase());
            }
            newModulePatterns[m] = out.join('');
        }
        $hexInput.val(newModulePatterns.join('|'));
        hexInputToLeds();
    });

    $('#shift-left-button').off('click').click(function () {
        var currentFullPattern = getInputHexValue();
        var modulePatterns = currentFullPattern.split('|');
        var newModulePatterns = Array(modulePatterns.length).fill('');

        for (var m = 0; m < modulePatterns.length; m++) {
            var pattern = modulePatterns[m];
            var out = [];
            for (var i = 0; i < 8; i++) {
                var byte = parseInt(pattern.substr(i * 2, 2), 16);
                byte >>= 1;
                out.push(('00' + byte.toString(16)).substr(-2).toUpperCase());
            }
            newModulePatterns[m] = out.join('');
        }
        $hexInput.val(newModulePatterns.join('|'));
        hexInputToLeds();
    });

    $hexInput.off('keyup').keyup(function () {
        // hexInputToLeds(); // Apply 버튼으로 수동 업데이트하도록 변경
    });

    $deleteButton.off('click').click(function () {
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

        if ($nextFrame.length) {
            $hexInput.val($nextFrame.attr('data-hex'));
        }

        processToSave($nextFrame);

        hexInputToLeds();
    });

    $insertButton.off('click').click(function () {
        var $newFrame = makeFrameElement(getInputHexValue());
        var $selectedFrame = $frames.find('.frame-container.selected').first();

        if ($selectedFrame.length) {
            $selectedFrame.after($newFrame);
        } else {
            $frames.append($newFrame);
        }

        processToSave($newFrame);
    });

    $updateButton.off('click').click(function () {
        var $newFrame = makeFrameElement(getInputHexValue());
        var $selectedFrame = $frames.find('.frame-container.selected').first();

        if ($selectedFrame.length) {
            $selectedFrame.replaceWith($newFrame);
        } else {
            $frames.append($newFrame);
        }

        processToSave($newFrame);
    });

    // 출력 언어 라디오 버튼 변경 시
    $('input[name="output_lang"]').off('change').change(function () {
        var patterns = framesToPatterns();
        printCode(patterns); // printCode 호출
    });
	
    // 출력 형식 라디오 버튼 변경 시 (새로 추가)
    $('input[name="output_format_type"]').off('change').change(function () {
        var patterns = framesToPatterns();
        printCode(patterns); // printCode 호출
    });


    $('#matrix-toggle').off('hover').hover(function () {
        $colsGlobal.find('.item').addClass('hover');
        $rowsGlobal.find('.item').addClass('hover');
    }, function () {
        $colsGlobal.find('.item').removeClass('hover');
        $rowsGlobal.find('.item').removeClass('hover');
    });

    $('#matrix-toggle').off('mousedown').mousedown(function () {
        var totalLeds = TOTAL_PIXEL_COLS * TOTAL_PIXEL_ROWS;
        $leds.find('.item').toggleClass('active', $leds.find('.item.active').length !== totalLeds);
        ledsToHex();
    });

    $('#circuit-theme').off('click').click(function () {
        if ($body.hasClass('circuit-theme')) {
            $body.removeClass('circuit-theme');
            // Cookies.set('page-theme', 'plain-theme', {path: ''});
        } else {
            $body.addClass('circuit-theme');
            // Cookies.set('page-theme', 'circuit-theme', {path: ''});
        }
    });

    $('.leds-case').off('click').click(function () {
        var themeName = $(this).attr('data-leds-theme');
        setLedsTheme(themeName);
        // Cookies.set('leds-theme', themeName, {path: ''});
    });

    function setLedsTheme(themeName) {
        $body.removeClass('red-leds yellow-leds green-leds blue-leds white-leds').addClass(themeName);
    }

    function setPageTheme(themeName) {
        $body.removeClass('plain-theme circuit-theme').addClass(themeName);
    }

    var playInterval;

    $('#play-button').off('click').click(function () {
        if (playInterval) {
            $('#play-button-stop').hide();
            $('#play-button-play').show();
            clearInterval(playInterval);
            playInterval = null;
        } else {
            $('#play-button-stop').show();
            $('#play-button-play').hide();

            playInterval = setInterval(function () {
                var $selectedFrame = $frames.find('.frame-container.selected').first();
                var $nextFrame = $selectedFrame.next('.frame-container').first();

                if (!$nextFrame.length) {
                    $nextFrame = $frames.find('.frame-container').first();
                }

                if ($nextFrame.length) {
                    $hexInput.val($nextFrame.attr('data-hex'));
                }

                processToSave($nextFrame);

                hexInputToLeds();
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

    NUM_COLS_MATRIX = parseInt($numColsMatrix.val());
    NUM_ROWS_MATRIX = parseInt($numRowsMatrix.val());

    drawMatrixUI();
    loadState();

    // var ledsTheme = Cookies.get('leds-theme');
    // if (ledsTheme) {
    //     setLedsTheme(ledsTheme);
    // }

    // var pageTheme = Cookies.get('page-theme') || 'circuit-theme';
    // setPageTheme(pageTheme);

});

