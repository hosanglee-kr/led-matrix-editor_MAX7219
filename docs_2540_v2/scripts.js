$(function () {
    var $body = $('body');
    var $frames = $('#frames');
    var $hexInput = $('#hex-input');
    var $insertButton = $('#insert-button');
    var $deleteButton = $('#delete-button');
    var $updateButton = $('#update-button'); // update 버튼
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
                    // 현재 패턴은 이미 LSB first로 되어있다고 가정합니다.
                    // 즉, pattern.substr(0, 2)는 col7, pattern.substr(14, 2)는 col0
                    // 이를 0x7E1818181C181800 이라는 패턴으로 예를 들면:
                    // 7E (col7), 18 (col6), ..., 00 (col0)
                    // 따라서 배열에 넣을 때는 00, 18, 18, 1C, 18, 18, 18, 7E 순서로 저장해야 합니다.
                    // 웹 에디터가 16진수 입력/출력에서 '0000000000000000' (MSB first)로 처리하고 있다면
                    // pattern.substr(2*j, 2)는 col_j의 바이트를 의미합니다.
                    // 이 경우 for (var j = 0; j < 8; j++) {
                    //    var byteVal = parseInt(pattern.substr(2 * j, 2), 16);
                    //    out.push('0x' + ('00' + byteVal.toString(16)).slice(-2).toUpperCase());
                    // } 로 변경해야 합니다.
                    // 현재 코드는 `pattern.substr(-2 * j, 2)` (즉, 뒤에서부터 읽는) 방식으로 되어 있으므로
                    // 16진수 문자열이 '0000000000000000' 일 때, 첫 2자리는 최하위 컬럼을 나타내고
                    // 마지막 2자리는 최상위 컬럼을 나타낸다고 가정한 상태입니다.
                    // 이 가정을 유지하겠습니다.

                    // 기존 코드를 LSB first byte 배열로 그대로 변환합니다.
                    // 즉, 0x7E1818181C181800 에서 00이 첫 번째 바이트 (col0)
                    // 7E가 여덟 번째 바이트 (col7) 로 들어갑니다.
                    // 이를 위해 `pattern.substr(-2 * (j + 1), 2)` 를 사용해야 합니다.
                    for (var j = 0; j < 8; j++) { // LSB (col0) 부터 MSB (col7) 순서로 바이트를 배열에 추가
                         var byteStr = pattern.substr(14 - (j * 2), 2); // 00이 14,15 인덱스
                         var byteVal = parseInt(byteStr, 16);
                         out.push('0x' + ('00' + byteVal.toString(16)).slice(-2).toUpperCase());
                         if (!(m === numModules - 1 && j === 7)) { // 마지막 모듈의 마지막 바이트가 아니면 콤마
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
                    for (var j = 0; j < 8; j++) { // LSB (col0) 부터 MSB (col7) 순서로 바이트를 배열에 추가
                        var byteStr = pattern.substr(14 - (j * 2), 2); // 00이 14,15 인덱스
                        var byteVal = parseInt(byteStr, 16);
                        out.push('0x' + ('00' + byteVal.toString(16)).slice(-2).toUpperCase());
                        if (!(m === numModules - 1 && j === 7)) {
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
        var moduleHexPatterns = Array(numModules).fill('0000000000000000'); // 각 모듈 16자리 HEX 초기화

        for (var r = 0; r < TOTAL_PIXEL_ROWS; r++) { // 전체 매트릭스 Row
            for (var c = 0; c < TOTAL_PIXEL_COLS; c++) { // 전체 매트릭스 Col
                var $led = $leds.find('.item[data-row=' + (r + 1) + '][data-col=' + (c + 1) + ']');
                if ($led.hasClass('active')) {
                    var moduleCoords = getModuleCoords(c, r);
                    if (moduleCoords) {
                        var moduleIndex = moduleCoords.moduleIndex;
                        var localX = moduleCoords.localX; // 모듈 내의 0-7 컬럼
                        var localY = moduleCoords.localY; // 모듈 내의 0-7 로우

                        var currentModulePattern = moduleHexPatterns[moduleIndex];
                        var bytes = [];
                        for (var i = 0; i < 8; i++) {
                            bytes.push(currentModulePattern.substr(i * 2, 2));
                        }

                        // 웹 에디터의 16진수 패턴은 `pattern.substr(-2 * i, 2)` (i는 1부터 8) 방식으로
                        // 로우 데이터를 추출하고, 이는 다시 말해 16진수 문자열이 `Col7Col6Col5Col4Col3Col2Col1Col0` 순서로 저장된 것입니다.
                        // 즉, pattern의 첫 두 글자(인덱스 0,1)가 Col7, 마지막 두 글자(인덱스 14,15)가 Col0 입니다.
                        // 따라서 특정 localX에 해당하는 바이트를 찾으려면, 인덱스 계산을 정확히 해야 합니다.
                        // localX가 0일 때 Col0, localX가 7일 때 Col7
                        // Col0의 바이트는 인덱스 14,15
                        // Col7의 바이트는 인덱스 0,1
                        // 인덱스는 (7 - localX) * 2 입니다.
                        var byteCharIndex = (7 - localX) * 2;
                        var currentByte = parseInt(currentModulePattern.substr(byteCharIndex, 2), 16);
                        
                        // localY 위치의 비트를 1로 설정
                        currentByte |= (1 << localY);

                        // 업데이트된 바이트를 다시 HEX 문자열에 반영
                        moduleHexPatterns[moduleIndex] = currentModulePattern.substr(0, byteCharIndex) +
                                                          ('00' + currentByte.toString(16)).slice(-2).toUpperCase() +
                                                          currentModulePattern.substr(byteCharIndex + 2);
                    }
                }
            }
        }
        $hexInput.val(moduleHexPatterns.join('|'));
        // LED 상태 변경 시 코드가 즉시 업데이트되도록 saveState() 호출
        saveState();
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

            for (var i = 0; i < 8; i++) { // 로우 (Y)
                // 16진수 문자열에서 특정 컬럼(X)에 해당하는 바이트를 가져옵니다.
                // 위 ledsToHex() 함수에서 `pattern.substr(14 - (j * 2), 2)` 방식으로 바이트를 저장했으므로,
                // 이를 다시 읽을 때는 `pattern.substr(14 - (localX * 2), 2)` 방식으로 읽어야 합니다.
                // 그러나 hexInputToLeds()는 전체 픽셀을 순회하며 localX, localY를 계산하므로
                // `pattern.substr(-2 * (col_idx + 1), 2)` 방식으로 원래대로 해석할 수 있습니다.
                // 16진수 패턴은 `Col7Col6...Col0` 순서로 저장되어 있다고 가정합니다.
                // `pattern.substr(-2 * (i + 1), 2)`는 `Col_i`의 바이트를 가져옵니다.
                // (i=0 -> Col0, i=1 -> Col1, ..., i=7 -> Col7)
                var byte = modulePattern.substr(14 - (i * 2), 2); // pattern.substr(14,2)는 col0, pattern.substr(0,2)는 col7
                byte = parseInt(byte, 16);

                for (var j = 0; j < 8; j++) { // 컬럼 (X)
                    var active = !!(byte & (1 << j)); // LSB (Y=0) 부터 확인
                    if (active) {
                        var globalX = startGlobalX + i; // i는 localX 역할을 합니다.
                        var globalY = startGlobalY + j; // j는 localY 역할을 합니다.
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
            // 유니코드 공백문자 및 BOM 제거
            if (code) {
                // 제어 문자(C0, C1) 및 BOM (U+FEFF) 제거
                code = code.replace(/[\u0000-\u001F\u007F-\u009F\uFEFF]/g, '');
                // 폰트 파일 등에 사용되는 널 문자 제거 (추가적으로)
                code = code.replace(/\0/g, '');
                // 콤마 뒤의 유니코드 공백 (예: U+200B Zero Width Space) 제거
                code = code.replace(/,\s*([\u200B\u200C\u200D\u2060\uFEFF])+/g, ',');
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


        printCode(patterns);
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
        saveState(); // 프레임 선택/변경 시 코드 업데이트
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
            ledsToHex(); // LED 클릭 시에도 즉시 코드 업데이트
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
        // 매트릭스 크기 변경 시에도 모든 프레임을 새 크기에 맞게 업데이트 (선택 사항)
        // 이 부분은 기존 프레임 데이터를 새 크기에 맞게 재구성하는 추가 로직이 필요할 수 있습니다.
        // 현재는 UI만 다시 그립니다.
        // 예를 들어:
        // var currentPatterns = framesToPatterns();
        // var newPatterns = [];
        // for(var i=0; i<currentPatterns.length; i++) {
        //     newPatterns.push(converter.fixPattern(currentPatterns[i])); // 새 NUM_COLS_MATRIX, NUM_ROWS_MATRIX에 맞춰 패딩/잘라내기
        // }
        // $frames.empty();
        // for(var i=0; i<newPatterns.length; i++) {
        //     $frames.append(makeFrameElement(newPatterns[i]));
        // }
        // var $firstFrame = $frames.find('.frame-container').first();
        // processToSave($firstFrame.length ? $firstFrame : insertNewEmptyFrame());
    });

    $hexInputApplyButton.click(function() {
        var newHexValue = getInputHexValue();
        $hexInput.val(newHexValue); // 입력된 HEX 값 정규화하여 다시 필드에 표시
        hexInputToLeds();
        var $selectedFrame = $frames.find('.frame-container.selected').first();
        if ($selectedFrame.length) {
            $selectedFrame.attr('data-hex', newHexValue);
            // 기존 프레임을 제거하고 새로운 프레임으로 교체 (UI 업데이트)
            $selectedFrame.replaceWith(makeFrameElement(newHexValue));
            // 교체된 새 프레임을 다시 선택된 상태로 만듦
            processToSave($frames.find('.frame-container[data-hex="' + newHexValue + '"]').first());
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
            // 현재 패턴은 Col7Col6...Col0 순서
            // 각 바이트는 LSB가 y0, MSB가 y7
            for (var j = 0; j < 8; j++) { // j=0 -> Col7, j=1 -> Col6, ... j=7 -> Col0
                bytes.push(parseInt(pattern.substr(j * 2, 2), 16));
            }

            var newBytes = Array(8).fill(0);
            for (var b = 0; b < 8; b++) { // 각 컬럼 바이트를 위로 한 칸 시프트 (비트를 왼쪽으로 시프트)
                newBytes[b] = (bytes[b] << 1) & 0xFF;
            }
            // 원래 Col7Col6...Col0 순서로 다시 조합
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
                newBytes[b] = bytes[b] >> 1; // 비트를 오른쪽으로 시프트
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
            var moduleRow = Math.floor(m / NUM_COLS_MATRIX);
            var moduleCol = m % NUM_COLS_MATRIX;

            var currentModuleLeds = [];
            // 현재 모듈의 LED 상태를 8x8 배열로 가져오기
            for (var r = 0; r < 8; r++) {
                var byte = parseInt(pattern.substr(14 - (r * 2), 2), 16); // Col0, Col1, ..., Col7 순서로 바이트 가져오기
                for (var c = 0; c < 8; c++) {
                    currentModuleLeds.push(!!(byte & (1 << c))); // (col_index, row_index)
                }
            }

            var shiftedLeds = Array(64).fill(false);
            for (var r = 0; r < 8; r++) {
                for (var c = 0; c < 8; c++) {
                    var originalIndex = r * 8 + c; // 현재 (col, row)
                    var newCol = c + 1; // 오른쪽으로 한 칸 시프트
                    if (newCol < 8) {
                        var newIndex = r * 8 + newCol;
                        shiftedLeds[newIndex] = currentModuleLeds[originalIndex];
                    }
                }
            }

            // 시프트된 LED 배열을 다시 HEX 패턴으로 변환
            var out = [];
            for (var c = 0; c < 8; c++) { // Col0부터 Col7까지
                var newByte = 0;
                for (var r = 0; r < 8; r++) {
                    if (shiftedLeds[r * 8 + c]) { // (row_idx * 8 + col_idx)
                        newByte |= (1 << r); // 해당 로우(비트) 설정
                    }
                }
                out.push(('00' + newByte.toString(16)).substr(-2).toUpperCase());
            }
            // Col7Col6...Col0 순서로 재정렬
            newModulePatterns[m] = out.reverse().join('');
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
            var moduleRow = Math.floor(m / NUM_COLS_MATRIX);
            var moduleCol = m % NUM_COLS_MATRIX;

            var currentModuleLeds = [];
            for (var r = 0; r < 8; r++) {
                var byte = parseInt(pattern.substr(14 - (r * 2), 2), 16); // Col0, Col1, ..., Col7 순서로 바이트 가져오기
                for (var c = 0; c < 8; c++) {
                    currentModuleLeds.push(!!(byte & (1 << c)));
                }
            }

            var shiftedLeds = Array(64).fill(false);
            for (var r = 0; r < 8; r++) {
                for (var c = 0; c < 8; c++) {
                    var originalIndex = r * 8 + c;
                    var newCol = c - 1; // 왼쪽으로 한 칸 시프트
                    if (newCol >= 0) {
                        var newIndex = r * 8 + newCol;
                        shiftedLeds[newIndex] = currentModuleLeds[originalIndex];
                    }
                }
            }

            var out = [];
            for (var c = 0; c < 8; c++) { // Col0부터 Col7까지
                var newByte = 0;
                for (var r = 0; r < 8; r++) {
                    if (shiftedLeds[r * 8 + c]) {
                        newByte |= (1 << r);
                    }
                }
                out.push(('00' + newByte.toString(16)).substr(-2).toUpperCase());
            }
            newModulePatterns[m] = out.reverse().join('');
        }
        $hexInput.val(newModulePatterns.join('|'));
        hexInputToLeds();
    });

    $hexInput.off('keyup').keyup(function () {
        // HEX 입력 필드에서 Enter 키를 눌렀을 때만 hexInputToLeds() 호출
        if (event.keyCode === 13) { // Enter key
            $hexInputApplyButton.click();
        }
        // 이 곳에서는 saveState()를 직접 호출하지 않습니다.
        // 사용자가 HEX를 직접 입력하는 중에는 아직 완료되지 않았을 수 있기 때문입니다.
        // $hexInputApplyButton.click()에서 saveState()를 호출합니다.
    });

    $deleteButton.off('click').click(function () {
        var $selectedFrame = $frames.find('.frame-container.selected').first();
        var $nextFrame = $selectedFrame.next('.frame-container').first();

        if (!$nextFrame.length) {
            $nextFrame = $selectedFrame.prev('.frame-container').first();
        }

        $selectedFrame.remove();

        if (!$frames.find('.frame-container').length) {
            // 모든 프레임이 삭제되면 빈 프레임 하나를 추가
            insertNewEmptyFrame();
            $nextFrame = $frames.find('.frame-container').first();
        }

        if ($nextFrame.length) {
            $hexInput.val($nextFrame.attr('data-hex'));
        }

        processToSave($nextFrame); // 삭제 후 새로운 프레임 선택 및 상태 저장
        hexInputToLeds(); // 새롭게 선택된 프레임을 LED 매트릭스에 그리기
    });

    $insertButton.off('click').click(function () {
        var $newFrame = makeFrameElement(getInputHexValue());
        var $selectedFrame = $frames.find('.frame-container.selected').first();

        if ($selectedFrame.length) {
            $selectedFrame.after($newFrame);
        } else {
            $frames.append($newFrame);
        }

        processToSave($newFrame); // 삽입 후 새 프레임 선택 및 상태 저장
    });

    $updateButton.off('click').click(function () {
        var $selectedFrame = $frames.find('.frame-container.selected').first();
        if ($selectedFrame.length) {
            var currentHex = ledsToHex(); // 현재 LED 매트릭스 상태를 HEX로 변환하고 hexInput에도 업데이트 (그리고 saveState도 호출)
            var updatedHex = $hexInput.val(); // ledsToHex() 호출 후 $hexInput에 저장된 값
            
            $selectedFrame.attr('data-hex', updatedHex); // 선택된 프레임의 data-hex 업데이트
            // UI의 프레임 미리보기도 업데이트
            $selectedFrame.replaceWith(makeFrameElement(updatedHex));
            // 업데이트된 새 프레임을 다시 선택된 상태로 만듦
            processToSave($frames.find('.frame-container[data-hex="' + updatedHex + '"]').first());
            // ledsToHex() 내부에서 saveState()를 이미 호출하고 있으므로 여기서는 제거
            // saveState();
        }
    });

    // 출력 언어 라디오 버튼 변경 시
    $('input[name="output_lang"]').off('change').change(function () {
        var patterns = framesToPatterns();
        printCode(patterns);
    });
	
    // 출력 형식 라디오 버튼 변경 시 (새로 추가)
    $('input[name="output_format_type"]').off('change').change(function () {
        var patterns = framesToPatterns();
        printCode(patterns);
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

                processToSave($nextFrame); // 프레임 전환 시 상태 저장 및 코드 업데이트
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
            saveState(); // 프레임 순서 변경 시 상태 저장
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
