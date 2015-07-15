prefs = require './prefs'
keymap = require './keymap'
{join, esc, dict, hex, ord, qw, delay} = require './util'

$pfx = $lc = null # DOM elements for "Prefix" and "Locale"
NK = 58 # number of scancodes we are concerned with

L = (g, s) -> # layout constructor
  # g: the geometry (aka "mechanical layout"); the precise arrangement of keys is specified as a CSS class
  a = ['', '']
  for line in s.split '\n'
    for chunk, i in line.split /\s{3,}/
      a[i] += chunk.replace /\s+/g, ''
  console.assert a[0].length == a[1].length
  {geometry: g, normal: a[0], shifted: a[1]}

layouts = # indexed by scancode; see http://www.abreojosensamblador.net/Productos/AOE/html/Pags_en/ApF.html
  US: L 'ansi', '''
    ☠ ` 1 2 3 4 5 6 7 8 9 0 - = ☠ ☠   ☠ ~ ! @ # $ % ^ & * ( ) _ + ☠ ☠
    ☠ q w e r t y u i o p [ ] \\      ☠ Q W E R T Y U I O P { } |
    ☠ a s d f g h j k l ; ' ☠ ☠       ☠ A S D F G H J K L : " ☠ ☠
    ☠ ☠ z x c v b n m , . / ☠ ☠       ☠ ☠ Z X C V B N M < > ? ☠ ☠
  '''
  UK: L 'iso', '''
    ☠ ` 1 2 3 4 5 6 7 8 9 0 - = ☠ ☠   ☠ ¬ ! " £ $ % ^ & * ( ) _ + ☠ ☠
    ☠ q w e r t y u i o p [ ] ☠       ☠ Q W E R T Y U I O P { } ☠
    ☠ a s d f g h j k l ; ' # ☠       ☠ A S D F G H J K L : @ ~ ☠
    ☠ \\ z x c v b n m , . / ☠ ☠      ☠ | Z X C V B N M < > ? ☠ ☠
  '''
  DK: L 'iso', '''
    ☠ $ 1 2 3 4 5 6 7 8 9 0 + ´ ☠ ☠   ☠ § ! " # € % & / ( ) = ? ` ☠ ☠
    ☠ q w e r t y u i o p å ¨ ☠       ☠ Q W E R T Y U I O P Å ^ ☠
    ☠ a s d f g h j k l æ ø ' ☠       ☠ A S D F G H J K L Æ Ø * ☠
    ☠ < z x c v b n m , . - ☠ ☠       ☠ > Z X C V B N M ; : _ ☠ ☠
  '''

@name = 'Glyphs'

@init = ($e) ->
  specialKeys = 15: '⟵', 16: '↹', 30: 'Caps', 43: '↲', 44: '⇧', 57: '⇧'
  $e.html """
    <label id=glyphs-pfx-label>Prefix: <input id=glyphs-pfx class=text-field size=1></label>
    <a href=# id=glyphs-reset>Reset</a>
    <table id=glyphs-legend class=key
           title='Prefix followed by shift+key produces the character in red.\nPrefix followed by an unshifted key produces the character in blue.'>
      <tr><td class=g2>⇧x</td><td class=g3><span class=pfx2>`</span>&nbsp;⇧x</td></tr>
      <tr><td class=g0>x</td><td class=g1><span class=pfx2>`</span>&nbsp;x</td></tr>
    </table>
    <div id=glyphs-layout>#{join(
      for i in [1...NK]
        if s = specialKeys[i]
          "<span id=k#{i} class=key>#{esc s}</span>"
        else
          """
            <span id=k#{i} class=key>
              <span class=g2></span><input class=g3><br>
              <span class=g0></span><input class=g1>
            </span>
          """
    )}</div>
    <select id=glyphs-lc>#{join((for x, _ of layouts then "<option>#{x}").sort())}</select>
  """
  .on 'focus', '.key input', -> delay 1, (=> $(@).select(); return); return
  .on 'blur', '.key input', -> $(@).val(v = $(@).val()[-1..] || ' ').prop 'title', "U+#{hex ord(v), 4}"; return
  .on 'mouseover mouseout', '.key input', (e) -> $(@).toggleClass 'hover', e.type == 'mouseover'; return
  if !prefs.kbdLocale()
    prefs.kbdLocale(
      switch navigator.language
        when 'en-GB'       then 'UK'
        when 'da', 'da_DK' then 'DK'
        else                    'US'
    )
  $('#glyphs-reset').button().click ->
    $pfx.val(prefs.prefixKey.getDefault()).change() # fire a "change" event to update the legend
    loadBQMap keymap.getDefaultBQMap()
    false
  $lc = $('#glyphs-lc').val(prefs.kbdLocale()).change ->
    prefs.kbdLocale $(@).val()
    load $.extend {}, keymap.getBQMap(), dict $('#glyphs-layout .key').map ->
      [[$('.g0', @).text(), $('.g1', @).val()], [$('.g2', @).text(), $('.g3', @).val()]]
    return
  $pfx = $ '#glyphs-pfx'
    .on 'change keyup', -> $('#glyphs-legend .pfx2').text $(@).val()[-1..]; return
    .focus -> delay 1, (=> $(@).select(); return); return
  return

@load = load = (bq) -> # bq: current mappings, possibly not yet saved
  $pfx.val(prefs.prefixKey()).change() # fire a "change" event to update the legend
  loadBQMap bq || keymap.getBQMap()
  return

loadBQMap = (bq) ->
  layout = layouts[$lc.val()] || layouts.US
  $('#glyphs-layout').removeClass('geometry-ansi geometry-iso').addClass "geometry-#{layout.geometry}"
  for i in [1...NK]
    if (g0 = layout.normal[i]) != '☠'
      g1 = bq[g0] || ' '; $("#k#{i} .g0").text g0; $("#k#{i} .g1").val(g1).prop 'title', "U+#{hex ord(g1), 4}"
    if (g2 = layout.shifted[i]) != '☠'
      g3 = bq[g2] || ' '; $("#k#{i} .g2").text g2; $("#k#{i} .g3").val(g3).prop 'title', "U+#{hex ord(g3), 4}"
  return

@validate = -> if $pfx.val().length != 1 then message: 'Invalid prefix key', element: $pfx

@save = ->
  prefs.prefixKey $pfx.val()
  keymap.setBQMap dict $('#glyphs-layout .key').map ->
    [[$('.g0', @).text(), $('.g1', @).val()], [$('.g2', @).text(), $('.g3', @).val()]]
  return
