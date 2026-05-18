# Hololive 人物 · AI 绘画提示词参考（测试用）

> 仅供你在本地/合规场景下调试模型与构图。**版权归 Cover 与各所属艺人所有**；商用、二次发布请自行遵守许可与平台规则。  
> 下列标签以 **英文 Danbooru / SD 社区常用写法** 为主，可按模型词表替换为日文或中文插件翻译结果。

---

## 1. 怎么用这份表

1. **基底**：先写画质与风格，再叠角色标签，最后补场景与光影。  
2. **人物锁定**：`virtual youtuber`, `hololive` 有助于画风收敛（视模型训练数据而定，有时需加权 `(hololive:1.1)`）。  
3. **分辨率**：竖版半身/胸像可试 **768×1152** 或 **832×1216**（接近你百科卡片的 3:4）；横版场景可用 1216×832。  
4. **迭代**：同一角色先试「发色 + 瞳色 + 标志性饰品」，再逐步加服装关键词，避免一次堆太长。

**正向模板（可复制改）**

```text
masterpiece, best quality, newest, absurdres,
1girl, solo, virtual youtuber, hololive,
<在此粘贴下方某一角色的标签>,
upper body, looking at viewer, simple background
```

**负面提示（示例）**

```text
lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry
```

---

## 2. 零期・初期相关

### Tokino Sora（ときのそら）

```text
tokino sora, brown hair, long hair, hair ribbon, blue eyes, school uniform, idol
```

### Roboco（ロボ子さん）

```text
roboco-san, android, mechanical parts, headphones, short hair, brown hair, red eyes
```

### Sakura Miko（さくらみこ）

```text
sakura miko, pink hair, ahoge, bell, shrine maiden, red hakama, cherry blossom print
```

### Hoshimachi Suisei（星街すいせい）

```text
hoshimachi suisei, blue hair, side ponytail, beret, plaid clothes, gloves, idol costume
```

### AZKi（アズキ）

```text
azki (hololive), brown hair, pink streaked hair, beret, idol
```

---

## 3. 一期生

### Yozora Mel

```text
yozora mel, blonde hair, ahoge, bat wings, hood, fangs
```

### Shirakami Fubuki（白上フブキ）

```text
shirakami fubuki, white hair, animal ears, fox ears, fox tail, ahoge, hood, cornflower blue eyes
```

### Natsuiro Matsuri

```text
natsuiro matsuri, brown hair, side ponytail, ahoge, white shorts, crop top
```

### Aki Rosenthal

```text
aki rosenthal, blonde hair, elf, pointy ears, bob cut, hair ornament
```

### Akai Haato / Haachama

```text
akai haato, blonde hair, heart hair ornament, twin braids, red ribbon
```

---

## 4. 二期生

### Minato Aqua（湊あくあ）

```text
minato aqua, blue hair, drill hair, maid headdress, maid, anchor symbol
```

### Murasaki Shion

```text
murasaki shion, grey hair, witch hat, striped thighhighs, cape
```

### Nakiri Ayame（百鬼あやめ）

```text
nakiri ayame, white hair, horns, oni, kimono, double bun
```

### Yuzuki Choco

```text
yuzuki choco, demon horns, pointy ears, labcoat
```

### Oozora Subaru（大空スバル）

```text
oozora subaru, short brown hair, backwards hat, shorts, sporty
```

---

## 5. Gamers

### Inugami Korone（戌神ころね）

```text
inugami korone, brown hair, dog ears, dog tail, bone hair ornament, hoodie
```

### Nekomata Okayu（猫又おかゆ）

```text
nekomata okayu, purple hair, cat ears, cat tail, hoodie, food-themed
```

---

## 6. 三期生（ホロライブファンタジー）

### Usada Pekora（兎田ぺこら）

```text
usada pekora, blue white hair, twin braids, rabbit ears, carrot hair ornament, scarf
```

### Shiranui Flare（不知火フレア）

```text
shiranui flare, blonde hair, dark elf, pointy ears, high ponytail, bow
```

### Shirogane Noel（白銀ノエル）

```text
shirogane noel, grey hair, braid crown, armor, knight, green eyes
```

### Houshou Marine（宝鐘マリン）

```text
houshou marine, red hair, heterochromia, eyepatch, pirate hat, pirate costume
```

### Uruha Rushia（潤羽るしあ）

```text
uruha rushia, green hair, butterfly hair ornament, skull hair ornament
```

---

## 7. 四期生（ホロふぉーす）

### Amane Kanata（天音かなた）

```text
amane kanata, blue silver hair, halo, single wing, asymmetrical legwear
```

### Kiryu Coco（桐生ココ）

```text
kiryu coco, blonde hair, dragon horns, dragon tail, red bow
```

### Tsunomaki Watame（角巻わため）

```text
tsunomaki watame, blonde hair, sheep horns, sheep ears, wool sweater
```

### Tokoyami Towa（常闇トワ）

```text
tokoyami towa, multicolored hair, demon tail, piercings, hat
```

### Himemori Luna（姫森ルーナ）

```text
himemori luna, blonde hair, crown, heterochromia, candy motif
```

---

## 8. 五期生（ねぽらぼ）

### Yukihana Lamy（雪花ラミィ）

```text
yukihana lamy, blue hair, elf, pointy ears, flower hair ornament, sake motif
```

### Momosuzu Nene（桃鈴ねね）

```text
momosuzu nene, blonde hair, double bun, bear hood, bell
```

### Shishiro Botan（獅白ぼたん）

```text
shishiro botan, grey hair, lion ears, lion tail, piercing, jacket
```

### Omaru Polka（尾丸ポルカ）

```text
omaru polka, blonde pink hair, fox ears, clown motif, playing card theme
```

---

## 9. 六期生（秘密結社 holoX）

### La+ Darknesss（ラプラス・ダークネス）

```text
la+ darknesss, grey hair, demon horns, yellow eyes, cloak
```

### Takane Lui（鷹嶺ルイ）

```text
takane lui, pink hair, wings head ornament, suit
```

### Hakui Koyori（博衣こより）

```text
hakui koyori, pink hair, animal ears, labcoat, heartbeat motif
```

### Sakamata Chloe（沙花叉クロヱ）

```text
sakamata chloe, grey hair, hood, orca tail, mask around neck
```

### Kazama Iroha（風真いろは）

```text
kazama iroha, blonde hair, ponytail, kimono, katana
```

---

## 10. Hololive English（节选）

### Mori Calliope

```text
mori calliope, pink hair, veil, tiara, hood, scythe
```

### Takanashi Kiara

```text
takanashi kiara, orange hair, feather hair ornament, phoenix motif
```

### Ninomae Ina'nis

```text
ninomae ina'nis, purple hair, tentacle hair, halo, flat chest
```

### Gawr Gura（がうる・ぐら）

```text
gawr gura, blue hair, blue hoodie, shark tail, shark hood, trident
```

### Watson Amelia

```text
watson amelia, blonde hair, detective coat, necktie, magnifying glass
```

### IRyS

```text
irys (hololive), demon horns, heterochromia, crystal motif
```

### Ouro Kronii

```text
ouro kronii, blue hair, hair intakes, clock motif, suit
```

### Nanashi Mumei

```text
nanashi mumei, brown hair, feather hair ornament, cloak, owl motif
```

### Ceres Fauna

```text
ceres fauna, green hair, flower hair ornament, antlers, nature motif
```

### Shiori Novella

```text
shiori novella, grey hair, book
```

---

## 11. Hololive Indonesia（节选）

### Ayunda Risu

```text
ayunda risu, squirrel ears, squirrel tail, hood
```

### Moona Hoshinova

```text
moona hoshinova, purple hair, moon motif, hoodie
```

### Airani Iofifteen

```text
airani iofifteen, alien, paintbrush, colorful hair
```

### Kaela Kovalskia

```text
kaela kovalskia, red eyes, hammer, blacksmith apron
```

### Kobo Kanaeru

```text
kobo kanaeru, blue hair, raincoat, umbrella
```

---

## 12. 测试清单（建议你记在人物百科里）

```text
种子：固定 seed，只改提示词
构图：对照同一组 upper body / full body
服装：先默认衣装，再换私服等（注意平台与用途合规）
权重：角色名或特征 (tag:1.05~1.15)，避免整张脸糊
LoRA：触发词单独一行记录，避免与通用标签冲突
```

---

## 13. 可选：日文检索词（配合翻译插件）

```text
星街すいせい
白上フブキ
宝鐘マリン
```

部分模型对日文标签更敏感；可与上文英文外貌词混用。

---

**文档版本**：便于本地测试；未列入的成员可按官方设定自行补「发色、瞳色、耳朵角尾、帽子、职业主题」五类关键词扩展。
