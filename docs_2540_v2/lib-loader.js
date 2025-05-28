// lib-loader.js

/**
 * lib-data.json 파일에서 라이브러리 데이터를 로드하고 #sets 요소에 렌더링합니다.
 * 이 함수는 scripts.js의 initialize() 함수에서 호출됩니다.
 */
function loadAndRenderLibrary() {
    // lib-data.json 파일의 경로를 현재 html 파일과 같은 경로로 지정합니다.
    $.getJSON('lib-data.json', function(data) {
        var $setsContainer = $('#sets');
        $setsContainer.empty(); // 기존 내용 비우기

        data.forEach(function(set, setIndex) {
            var setId = 'set-' + (setIndex + 1); // ID는 나중에 필요할 수도 있음
            var setName = set.name || ('№' + (setIndex + 1)); // 이름이 없으면 기본값

            var setHtml = '<li>' + setName + ': <br />';
            set.categories.forEach(function(category) {
                var categoryName = category.name;
                var patterns = category.patterns;
                // 링크 클릭 시 URL 해시를 변경하여 scripts.js에서 처리하도록 합니다.
                setHtml += '<a href="#' + patterns + '">' + categoryName + '</a> <br />';
            });
            setHtml += '</li>';
            $setsContainer.append(setHtml);
        });
    }).fail(function() {
        console.error("Failed to load lib-data.json");
        // 라이브러리 로드 실패 시 사용자에게 알림 또는 대체 콘텐츠 제공
        $('#sets').html('<li style="color: red;">Failed to load library data. Please check "lib-data.json".</li>');
    });
}

// 이 함수는 scripts.js에서 사용될 수 있도록 전역 스코프에 둡니다.
// 또는 scripts.js에서 바로 호출할 수 있도록 $(document).ready 안에 넣을 수도 있습니다.
// 여기서는 initialize()에서 호출하기 위해 전역 함수로 유지합니다.

